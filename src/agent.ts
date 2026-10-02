import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./mcp.js";
import type { OrderableService } from "./service.js";

/**
 * A Claude agent that talks to customers in chat apps (Telegram, Slack, ...) and acts
 * through Orderable's MCP tools. Tools are called through a real MCP client, so chat
 * customers get exactly the same surface, rules and safety checks as Claude Desktop.
 */

export interface ChatContext {
  channel: "telegram" | "slack" | "cli" | string;
  userName?: string | undefined;
  userHandle?: string | undefined;
}

export interface AgentOptions {
  service: OrderableService;
  client?: Pick<Anthropic, "beta">;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxToolRounds?: number;
  /** Conversations idle longer than this start fresh. */
  idleResetMinutes?: number;
  /** Conversations longer than this many messages start fresh (keeps cost bounded). */
  maxMessages?: number;
}

const SYSTEM = `You are the ordering assistant for the food businesses connected through Orderable. You chat with customers in a messaging app and use your tools to find locations, browse menus, plan group orders, quote, place, track and cancel orders.

How to work:
- Start from list_locations unless you already know the location_id. Use search_menu or plan_group_order to choose items, and get_item before quoting anything with required modifiers.
- Money in tool results is integer minor units (1295 = $12.95). Always show prices to customers as dollars.
- Never place an order without a fresh quote and the customer's explicit "yes" to the exact total. Show the total including tax and fees, the pickup or delivery time, and the payment method before asking.
- place_order needs the customer's name plus an email or phone number. Ask for whichever is missing; never invent contact details. Generate a new unique idempotency_key for each new order (for example "chat-" followed by random letters), and reuse the same key only when retrying that same order.
- If a tool returns an error, read its code and suggested_next_tool and recover (pick another time, item or location) instead of giving up. Tell the customer plainly what happened.
- Allergen status "unknown" means the merchant has not said. Never describe an item as safe for an allergy unless the data says so, and mention may_contain risks.
- If an order comes back with dry_run: true, tell the customer it was recorded as a test and was not sent to the kitchen.
- Resolve relative times like "tomorrow at noon" using the current time given in the message context and the location's timezone, and pass ISO 8601 times to tools.

Style: this is a chat app on a phone. Keep replies short and scannable: a sentence or two, then a compact list when listing items or a cart. Plain text only: no Markdown headings, tables or bold. Ask one question at a time.`;

interface Conversation {
  messages: Anthropic.Beta.BetaMessageParam[];
  updatedAt: number;
}

export class OrderableAgent {
  private readonly anthropic: Pick<Anthropic, "beta">;
  private readonly model: string;
  private readonly effort: NonNullable<AgentOptions["effort"]>;
  private readonly maxToolRounds: number;
  private readonly idleResetMs: number;
  private readonly maxMessages: number;
  private mcp: Promise<{ client: Client; tools: Anthropic.Beta.BetaTool[] }> | null = null;
  private conversations = new Map<string, Conversation>();
  private queues = new Map<string, Promise<unknown>>();

  /** The Orderable service this agent orders through. */
  get service() {
    return this.opts.service;
  }

  constructor(private readonly opts: AgentOptions) {
    this.anthropic = opts.client ?? new Anthropic();
    this.model = opts.model ?? process.env.ORDERABLE_AGENT_MODEL ?? "claude-opus-5-5";
    this.effort = opts.effort ?? (process.env.ORDERABLE_AGENT_EFFORT as AgentOptions["effort"]) ?? "medium";
    this.maxToolRounds = opts.maxToolRounds ?? 12;
    this.idleResetMs = (opts.idleResetMinutes ?? 120) * 60_000;
    this.maxMessages = opts.maxMessages ?? 80;
  }

  /** Connect an in-process MCP client to the Orderable server and expose its tools to Claude. */
  private connect() {
    this.mcp ??= (async () => {
      const server = createMcpServer(this.opts.service);
      const client = new Client({ name: "orderable-chat-agent", version: "1.0.0" });
      const [a, b] = InMemoryTransport.createLinkedPair();
      await Promise.all([server.connect(a), client.connect(b)]);
      const { tools } = await client.listTools();
      return {
        client,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description ?? "",
          input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
        })),
      };
    })();
    return this.mcp;
  }

  reset(conversationId: string) {
    this.conversations.delete(conversationId);
  }

  /** One customer message in, one reply out. Messages in the same conversation are processed in order. */
  reply(conversationId: string, text: string, ctx: ChatContext): Promise<string> {
    const prev = this.queues.get(conversationId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(() => this.run(conversationId, text, ctx));
    this.queues.set(conversationId, next);
    void next
      .catch(() => undefined)
      .finally(() => {
        if (this.queues.get(conversationId) === next) this.queues.delete(conversationId);
      });
    return next;
  }

  private async run(conversationId: string, text: string, ctx: ChatContext): Promise<string> {
    const { client: mcp, tools } = await this.connect();
    const now = this.opts.service.now();

    let convo = this.conversations.get(conversationId);
    // History is append-only (thinking blocks must be replayed unchanged), so a long or
    // stale conversation is replaced by a fresh one rather than trimmed.
    if (!convo || now.getTime() - convo.updatedAt > this.idleResetMs || convo.messages.length > this.maxMessages) {
      convo = { messages: [], updatedAt: now.getTime() };
    }

    const context = [
      `[context: ${ctx.channel} chat`,
      ctx.userName ? `, customer display name "${ctx.userName}"` : "",
      ctx.userHandle ? ` (${ctx.userHandle})` : "",
      `, now ${now.toISOString()}`,
      `, ${now.toLocaleString("en-CA", { timeZone: this.opts.service.config.policy.timezone, dateStyle: "full", timeStyle: "short" })} ${this.opts.service.config.policy.timezone}]`,
    ].join("");

    // Work on a copy and commit only when the turn completes, so a failed or refused turn
    // never leaves a dangling tool_use in the stored history.
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...convo.messages,
      { role: "user", content: `${context}\n${text}` },
    ];

    for (let round = 0; round <= this.maxToolRounds; round++) {
      const response = await this.anthropic.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: this.effort },
        cache_control: { type: "ephemeral" },
        system: SYSTEM,
        tools,
        messages,
      });

      if (response.stop_reason === "refusal") return "Sorry, I can't help with that request.";
      // A turn cut off at max_tokens may hold a truncated tool call: don't run or store it.
      if (response.stop_reason === "max_tokens") return "That reply got too long. Could you ask for a bit less at once?";

      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason === "pause_turn") continue;
      if (toolUses.length === 0 || response.stop_reason !== "tool_use") {
        this.conversations.set(conversationId, { messages, updatedAt: now.getTime() });
        const reply = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return reply || "Done.";
      }

      // Run the round's tool calls concurrently; all results go back in one user message.
      const results = await Promise.all(
        toolUses.map(async (use): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          try {
            const res = await mcp.callTool({ name: use.name, arguments: use.input as Record<string, unknown> });
            const content = (res.content as { type: string; text?: string }[])
              .filter((c) => c.type === "text")
              .map((c) => c.text ?? "")
              .join("\n");
            return { type: "tool_result", tool_use_id: use.id, content, ...(res.isError ? { is_error: true } : {}) };
          } catch (e) {
            return {
              type: "tool_result",
              tool_use_id: use.id,
              is_error: true,
              content: e instanceof Error ? e.message : String(e),
            };
          }
        }),
      );
      messages.push({ role: "user", content: results });
    }

    return "That took more steps than I can handle in one go. Could you narrow it down a little?";
  }
}

/** Split a reply into chunks that fit a chat platform's message limit, preferring line breaks. */
export function chunkText(text: string, max: number): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < max / 2) cut = rest.lastIndexOf(" ", max);
    if (cut < max / 2) cut = max;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

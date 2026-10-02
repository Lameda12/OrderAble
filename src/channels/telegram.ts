import { timingSafeEqual } from "node:crypto";
import { type OrderableAgent, chunkText } from "../agent.js";
import { STOCK_HELP, applyStockMessage } from "../stock-text.js";

/**
 * Telegram bot for Orderable. Two ways to run it:
 * - webhook: Telegram POSTs updates to your URL (serverless friendly, see handleTelegramWebhook)
 * - polling: `orderable bot telegram` long-polls getUpdates (no public URL needed)
 */

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean };
    text?: string;
  };
}

export class TelegramApi {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }

  async call<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
    const res = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; result: T; description?: string };
    if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
    return json.result;
  }

  async send(chatId: number, text: string) {
    for (const part of chunkText(text, 4000)) await this.call("sendMessage", { chat_id: chatId, text: part });
  }
}

const WELCOME = `Hi! I can order from local bakeries and cafes for you: lunch for the team, a cake for Friday, coffee for a meeting.

Try: "Lunch for 8 tomorrow at noon, 2 vegetarian, under $20 each, delivered to 1801 Hollis St."

/reset starts a new conversation.`;

const seen = new Map<number, number>();

/** Handle one update. Safe to call twice for the same update_id (Telegram retries). */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  agent: OrderableAgent,
  api: TelegramApi,
  opts: { owners?: Set<string> } = {},
) {
  const now = Date.now();
  for (const [id, at] of seen) if (now - at > 10 * 60_000) seen.delete(id);
  if (seen.has(update.update_id)) return;
  seen.set(update.update_id, now);

  const msg = update.message;
  if (!msg?.text || msg.from?.is_bot) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const conversationId = `telegram:${chatId}`;

  const isOwner = !!msg.from && !!opts.owners?.has(String(msg.from.id));
  if (/^\/start\b/.test(text) || /^\/help\b/.test(text)) return api.send(chatId, isOwner ? `${WELCOME}\n\n${STOCK_HELP}` : WELCOME);

  // Owners (allow-listed by Telegram user id) can change stock in plain words. No LLM involved.
  if (isOwner) {
    if (/^\/stock\s*$/.test(text)) return api.send(chatId, STOCK_HELP);
    const result = await applyStockMessage(agent.service.adapter, text);
    if (result.handled) return api.send(chatId, result.message);
  }
  if (/^\/reset\b/.test(text)) {
    agent.reset(conversationId);
    return api.send(chatId, "Fresh start. What can I get you?");
  }

  // Keep the "typing…" indicator alive while the agent works (it expires after ~5 s).
  const typing = () => api.call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
  void typing();
  const timer = setInterval(typing, 4500);
  try {
    const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ");
    const reply = await agent.reply(conversationId, text, {
      channel: "telegram",
      userName: name || undefined,
      userHandle: msg.from?.username ? `@${msg.from.username}` : undefined,
    });
    await api.send(chatId, reply);
  } catch (e) {
    console.error("telegram reply failed", e);
    await api.send(chatId, "Something went wrong on my side. Please try again in a moment.").catch(() => undefined);
  } finally {
    clearInterval(timer);
  }
}

/** Verify Telegram's X-Telegram-Bot-Api-Secret-Token header (set via setWebhook secret_token). */
export function verifyTelegramSecret(header: string | null, secret: string) {
  if (!secret) return false;
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Long-poll getUpdates forever. Stops when the signal aborts. */
export async function runTelegramPolling(
  agent: OrderableAgent,
  api: TelegramApi,
  signal?: AbortSignal,
  opts: { owners?: Set<string> } = {},
) {
  await api.call("deleteWebhook", { drop_pending_updates: false });
  const me = await api.call<{ username: string }>("getMe");
  console.error(`Telegram bot @${me.username} is polling for messages`);
  let offset = 0;
  while (!signal?.aborted) {
    try {
      const updates = await api.call<TelegramUpdate[]>("getUpdates", { offset, timeout: 30, allowed_updates: ["message"] });
      for (const u of updates) {
        offset = u.update_id + 1;
        // Different chats run concurrently; the agent serializes messages within a chat.
        void handleTelegramUpdate(u, agent, api, opts);
      }
    } catch (e) {
      console.error("getUpdates failed, retrying in 3s:", e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

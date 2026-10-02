import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { OrderableAgent, chunkText } from "../src/agent.js";
import { handleSlackRequest, slackManifest, verifySlackSignature } from "../src/channels/slack.js";
import { TelegramApi, handleTelegramUpdate, verifyTelegramSecret } from "../src/channels/telegram.js";
import { createHttpHandler } from "../src/mcp.js";
import { setup } from "./helpers.js";

type Block = Record<string, unknown>;

/** A scripted stand-in for the Claude API: returns the given turns in order and records requests. */
function fakeClaude(turns: { stop_reason: string; content: Block[] }[]) {
  const requests: any[] = [];
  let i = 0;
  const client = {
    beta: {
      messages: {
        create: async (params: any) => {
          requests.push(structuredClone(params));
          const turn = turns[i++] ?? { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] };
          return { id: `msg_${i}`, type: "message", role: "assistant", model: params.model, ...turn };
        },
      },
    },
  };
  return { client: client as never, requests };
}

const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });
const text = (t: string) => ({ type: "text", text: t });

function agentWith(turns: Parameters<typeof fakeClaude>[0]) {
  const { service } = setup();
  const fake = fakeClaude(turns);
  return { agent: new OrderableAgent({ service, client: fake.client }), ...fake };
}

describe("chat agent", () => {
  it("runs Orderable tools through MCP and feeds results (including structured errors) back to Claude", async () => {
    const { agent, requests } = agentWith([
      { stop_reason: "tool_use", content: [toolUse("t1", "list_locations", { postal_code: "B3J 3N4", fulfillment: "delivery" })] },
      {
        stop_reason: "tool_use",
        content: [toolUse("t2", "quote_order", { location_id: "crumb-hydrostone", lines: [{ item_id: "crumb-morning-bun", quantity: 1 }], fulfillment: "pickup" })],
      },
      { stop_reason: "end_turn", content: [text("The morning buns are sold out at Hydrostone. Want Quinpool instead?")] },
    ]);

    const reply = await agent.reply("c1", "Two morning buns please", { channel: "telegram", userName: "Priya" });
    expect(reply).toMatch(/sold out/);
    expect(requests).toHaveLength(3);

    const first = requests[0];
    expect(first.model).toBe("claude-opus-5-5");
    expect(first.fallbacks).toBe("default");
    expect(first.betas).toContain("server-side-fallback-2026-07-01");
    expect(first.tools.map((t: { name: string }) => t.name)).toContain("plan_group_order");
    expect(first.messages[0].content).toMatch(/customer display name "Priya"/);

    const locResult = requests[1].messages.at(-1).content[0];
    expect(locResult.tool_use_id).toBe("t1");
    expect(JSON.parse(locResult.content).locations[0].id).toBe("northline-barrington");

    const quoteResult = requests[2].messages.at(-1).content[0];
    expect(quoteResult.is_error).toBe(true);
    expect(JSON.parse(quoteResult.content).error.code).toBe("ITEM_SOLD_OUT");
  });

  it("keeps conversation history append-only across turns and resets on request", async () => {
    const { agent, requests } = agentWith([
      { stop_reason: "end_turn", content: [text("Hi! What would you like?")] },
      { stop_reason: "end_turn", content: [text("Sure.")] },
      { stop_reason: "end_turn", content: [text("Hello again.")] },
    ]);
    await agent.reply("c2", "hi", { channel: "slack" });
    await agent.reply("c2", "lunch for 4", { channel: "slack" });
    expect(requests[1].messages).toHaveLength(3);
    expect(requests[1].messages.slice(0, 2)).toEqual(requests[0].messages.concat([{ role: "assistant", content: [text("Hi! What would you like?")] }]));
    agent.reset("c2");
    await agent.reply("c2", "hi", { channel: "slack" });
    expect(requests[2].messages).toHaveLength(1);
  });

  it("does not store a refused or truncated turn", async () => {
    const { agent, requests } = agentWith([
      { stop_reason: "refusal", content: [] },
      { stop_reason: "max_tokens", content: [toolUse("t1", "search_menu", { location_id: "x" })] },
      { stop_reason: "end_turn", content: [text("ok")] },
    ]);
    expect(await agent.reply("c3", "bad", { channel: "cli" })).toMatch(/can't help/);
    expect(await agent.reply("c3", "long", { channel: "cli" })).toMatch(/too long/);
    await agent.reply("c3", "fine", { channel: "cli" });
    expect(requests[2].messages).toHaveLength(1);
  });

  it("processes messages in one conversation in order", async () => {
    const { agent, requests } = agentWith([
      { stop_reason: "end_turn", content: [text("one")] },
      { stop_reason: "end_turn", content: [text("two")] },
    ]);
    const [a, b] = await Promise.all([agent.reply("c4", "first", { channel: "cli" }), agent.reply("c4", "second", { channel: "cli" })]);
    expect([a, b]).toEqual(["one", "two"]);
    expect(requests[1].messages).toHaveLength(3);
  });

  it("chunks long replies on line breaks", () => {
    const chunks = chunkText(`${"a".repeat(30)}\n${"b".repeat(30)}`, 40);
    expect(chunks).toEqual(["a".repeat(30), "b".repeat(30)]);
  });
});

function fakeFetch() {
  const calls: { url: string; body: any }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const method = String(url).split("/").pop();
    const result = method === "getMe" ? { username: "orderable_test_bot" } : method === "users.info" ? { user: { real_name: "Priya Shah" } } : true;
    return new Response(JSON.stringify({ ok: true, result, ...(typeof result === "object" ? result : {}) }));
  }) as typeof fetch;
  return { calls, impl };
}

describe("Telegram", () => {
  it("answers /start, replies through the agent, and ignores duplicate updates", async () => {
    const { agent } = agentWith([{ stop_reason: "end_turn", content: [text("Northline delivers to you.")] }]);
    const f = fakeFetch();
    const api = new TelegramApi("123:abc", f.impl);
    const msg = (update_id: number, t: string) => ({
      update_id,
      message: { message_id: update_id, chat: { id: 42, type: "private" }, from: { id: 7, first_name: "Priya", username: "priya" }, text: t },
    });

    await handleTelegramUpdate(msg(1, "/start"), agent, api);
    expect(f.calls.at(-1)!.body.text).toMatch(/order from local bakeries/);

    await handleTelegramUpdate(msg(2, "who delivers downtown?"), agent, api);
    await handleTelegramUpdate(msg(2, "who delivers downtown?"), agent, api);
    const sends = f.calls.filter((c) => c.url.endsWith("/sendMessage"));
    expect(sends).toHaveLength(2);
    expect(sends.at(-1)!.body).toEqual({ chat_id: 42, text: "Northline delivers to you." });
    expect(f.calls.some((c) => c.url.endsWith("/sendChatAction"))).toBe(true);
  });

  it("verifies the webhook secret header", () => {
    expect(verifyTelegramSecret("s3cret", "s3cret")).toBe(true);
    expect(verifyTelegramSecret("nope", "s3cret")).toBe(false);
    expect(verifyTelegramSecret(null, "s3cret")).toBe(false);
    expect(verifyTelegramSecret("anything", "")).toBe(false);
  });
});

describe("Slack", () => {
  const secret = "slack-signing-secret";
  const now = 1_790_000_000_000;
  const sign = (body: string, ts = String(Math.floor(now / 1000))) =>
    new Headers({
      "x-slack-request-timestamp": ts,
      "x-slack-signature": `v0=${createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}`,
      "content-type": body.startsWith("{") ? "application/json" : "application/x-www-form-urlencoded",
    });

  it("verifies signatures and rejects stale or forged requests", () => {
    const body = '{"type":"url_verification","challenge":"abc"}';
    const h = sign(body);
    expect(verifySlackSignature(secret, h.get("x-slack-request-timestamp"), body, h.get("x-slack-signature"), now)).toBe(true);
    expect(verifySlackSignature(secret, h.get("x-slack-request-timestamp"), body + " ", h.get("x-slack-signature"), now)).toBe(false);
    expect(verifySlackSignature(secret, h.get("x-slack-request-timestamp"), body, h.get("x-slack-signature"), now + 10 * 60_000)).toBe(false);
  });

  it("answers the URL verification challenge", () => {
    const { agent } = agentWith([]);
    const body = '{"type":"url_verification","challenge":"abc"}';
    const res = handleSlackRequest(body, sign(body), { agent, botToken: "xoxb", signingSecret: secret, now: () => now });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ challenge: "abc" });
    const forged = handleSlackRequest(body, new Headers({ "content-type": "application/json" }), { agent, botToken: "xoxb", signingSecret: secret, now: () => now });
    expect(forged.status).toBe(401);
  });

  it("acks a mention immediately, replies in the thread in the background, and drops duplicates and bot messages", async () => {
    const { agent, requests } = agentWith([{ stop_reason: "end_turn", content: [text("Planned lunch for 8. Total $151.20.")] }]);
    const f = fakeFetch();
    const deps = { agent, botToken: "xoxb", signingSecret: secret, fetchImpl: f.impl, now: () => now };
    const event = (event_id: string, extra: Record<string, unknown> = {}) =>
      JSON.stringify({
        type: "event_callback",
        event_id,
        event: { type: "app_mention", user: "U1", text: "<@UBOT> lunch for 8 tomorrow", ts: "1700.1", channel: "C1", ...extra },
      });

    const body = event("Ev1");
    const res = handleSlackRequest(body, sign(body), deps);
    expect(res.status).toBe(200);
    expect(requests).toHaveLength(0); // nothing heavy before the ack
    await res.background!();
    expect(requests[0].messages[0].content).toMatch(/lunch for 8 tomorrow$/);
    expect(requests[0].messages[0].content).toMatch(/"Priya Shah"/);
    const post = f.calls.find((c) => c.url.endsWith("/chat.postMessage"))!;
    expect(post.body).toEqual({ channel: "C1", thread_ts: "1700.1", text: "Planned lunch for 8. Total $151.20." });

    const dup = handleSlackRequest(body, sign(body), deps);
    expect(dup.background).toBeUndefined();
    const fromBot = event("Ev2", { bot_id: "B1" });
    expect(handleSlackRequest(fromBot, sign(fromBot), deps).background).toBeUndefined();
  });

  it("handles the /order slash command via response_url", async () => {
    const { agent } = agentWith([{ stop_reason: "end_turn", content: [text("Quote: $42.10. Place it?")] }]);
    const f = fakeFetch();
    const body = new URLSearchParams({
      command: "/order",
      text: "3 lattes for pickup at 2pm",
      user_id: "U1",
      channel_id: "C1",
      response_url: "https://hooks.slack.com/commands/T/1/abc",
    }).toString();
    const res = handleSlackRequest(body, sign(body), { agent, botToken: "xoxb", signingSecret: secret, fetchImpl: f.impl, now: () => now });
    expect(JSON.parse(res.body).text).toMatch(/Working on/);
    await res.background!();
    const final = f.calls.find((c) => c.url.startsWith("https://hooks.slack.com"))!;
    expect(final.body).toEqual({ response_type: "ephemeral", text: "Quote: $42.10. Place it?" });
  });

  it("generates a manifest pointing at the endpoints", () => {
    const m = slackManifest("https://orderable.example.com");
    expect(m.settings.event_subscriptions.request_url).toBe("https://orderable.example.com/slack/events");
    expect(m.features.slash_commands[0]!.url).toBe("https://orderable.example.com/slack/commands");
  });
});

describe("MCP over a URL-only connector", () => {
  it("accepts the token as the last path segment, and only the right one", async () => {
    const { service } = setup();
    const handle = createHttpHandler(service, "tok_123");
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    const ok = await handle(new Request("http://x/api/mcp/tok_123", { method: "POST", headers, body }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).result.tools).toHaveLength(9);
    const bad = await handle(new Request("http://x/api/mcp/tok_999", { method: "POST", headers, body }));
    expect(bad.status).toBe(401);
  });
});

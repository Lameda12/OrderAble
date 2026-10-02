import { createHmac, timingSafeEqual } from "node:crypto";
import { type OrderableAgent, chunkText } from "../agent.js";

/**
 * Slack app for Orderable: @mention it in a channel (it answers in a thread), DM it, or use
 * the /order slash command. Slack needs an answer within 3 seconds, so handleSlackRequest
 * returns the HTTP response immediately plus a `background` job that does the agent work.
 */

export interface SlackDeps {
  agent: OrderableAgent;
  botToken: string;
  signingSecret: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface SlackResult {
  status: number;
  body: string;
  contentType: string;
  background?: () => Promise<void>;
}

/** Verify Slack's v0 request signature (HMAC-SHA256 over `v0:{timestamp}:{body}`), 5 minute window. */
export function verifySlackSignature(
  signingSecret: string,
  timestamp: string | null,
  rawBody: string,
  signature: string | null,
  nowMs = Date.now(),
): boolean {
  if (!signingSecret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > 60 * 5) return false;
  const expected = `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function slackApi(deps: SlackDeps, method: string, body: Record<string, unknown>) {
  const res = await (deps.fetchImpl ?? fetch)(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${deps.botToken}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; error?: string; [k: string]: unknown };
  if (!json.ok) throw new Error(`Slack ${method} failed: ${json.error}`);
  return json;
}

const names = new Map<string, string>();
async function displayName(deps: SlackDeps, userId: string) {
  if (names.has(userId)) return names.get(userId);
  try {
    const res = (await slackApi(deps, "users.info", { user: userId })) as {
      user?: { real_name?: string; profile?: { real_name?: string; display_name?: string } };
    };
    const name = res.user?.profile?.real_name || res.user?.real_name || res.user?.profile?.display_name;
    if (name) names.set(userId, name);
    return name;
  } catch {
    return undefined; // users:read scope missing: the agent will ask for the name
  }
}

const seenEvents = new Map<string, number>();
function firstTime(eventId: string, nowMs: number) {
  for (const [id, at] of seenEvents) if (nowMs - at > 10 * 60_000) seenEvents.delete(id);
  if (seenEvents.has(eventId)) return false;
  seenEvents.set(eventId, nowMs);
  return true;
}

const json = (status: number, body: unknown): SlackResult => ({ status, body: JSON.stringify(body), contentType: "application/json" });

interface SlackEvent {
  type: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  channel: string;
  channel_type?: string;
}

export function handleSlackRequest(rawBody: string, headers: Headers, deps: SlackDeps): SlackResult {
  const now = deps.now?.() ?? Date.now();
  if (!verifySlackSignature(deps.signingSecret, headers.get("x-slack-request-timestamp"), rawBody, headers.get("x-slack-signature"), now))
    return json(401, { error: "invalid signature" });

  const contentType = headers.get("content-type") ?? "";

  // Slash command: application/x-www-form-urlencoded
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(rawBody);
    const text = (form.get("text") ?? "").trim();
    const userId = form.get("user_id") ?? "";
    const responseUrl = form.get("response_url") ?? "";
    const conversationId = `slack:cmd:${form.get("channel_id")}:${userId}`;
    if (!text || text === "help")
      return json(200, {
        response_type: "ephemeral",
        text: 'Order food from local spots. Try: `/order lunch for 8 tomorrow at noon, 2 vegetarian, under $20 each, delivered to 1801 Hollis St`. Use `/order reset` to start over.',
      });
    if (text === "reset") {
      deps.agent.reset(conversationId);
      return json(200, { response_type: "ephemeral", text: "Fresh start." });
    }
    return {
      ...json(200, { response_type: "ephemeral", text: `:hourglass_flowing_sand: Working on: _${text}_` }),
      background: async () => {
        let reply: string;
        try {
          reply = await deps.agent.reply(conversationId, text, {
            channel: "slack",
            userName: await displayName(deps, userId),
            userHandle: `<@${userId}>`,
          });
        } catch (e) {
          console.error("slack command failed", e);
          reply = "Something went wrong on my side. Please try again.";
        }
        await (deps.fetchImpl ?? fetch)(responseUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ response_type: "ephemeral", text: reply }),
        });
      },
    };
  }

  let payload: { type: string; challenge?: string; event_id?: string; event?: SlackEvent };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "bad json" });
  }

  if (payload.type === "url_verification") return json(200, { challenge: payload.challenge });
  if (payload.type !== "event_callback" || !payload.event) return json(200, { ok: true });

  const ev = payload.event;
  const isMention = ev.type === "app_mention";
  const isDm = ev.type === "message" && ev.channel_type === "im";
  // Ignore our own messages, edits, joins and other subtypes.
  if ((!isMention && !isDm) || ev.bot_id || ev.subtype || !ev.user || !ev.text) return json(200, { ok: true });
  if (!firstTime(payload.event_id ?? `${ev.channel}:${ev.ts}`, now)) return json(200, { ok: true, duplicate: true });

  const text = ev.text.replace(/<@[A-Z0-9]+>/g, "").trim();
  // Channels: one conversation per thread, replies in the thread. DMs: one conversation per DM.
  const threadTs = isMention ? (ev.thread_ts ?? ev.ts) : undefined;
  const conversationId = isMention ? `slack:${ev.channel}:${threadTs}` : `slack:dm:${ev.channel}`;

  return {
    ...json(200, { ok: true }),
    background: async () => {
      if (/^(reset|start over)$/i.test(text)) {
        deps.agent.reset(conversationId);
        await slackApi(deps, "chat.postMessage", { channel: ev.channel, thread_ts: threadTs, text: "Fresh start. What can I get you?" });
        return;
      }
      await slackApi(deps, "reactions.add", { channel: ev.channel, timestamp: ev.ts, name: "eyes" }).catch(() => undefined);
      let reply: string;
      try {
        reply = await deps.agent.reply(conversationId, text || "hi", {
          channel: "slack",
          userName: await displayName(deps, ev.user!),
          userHandle: `<@${ev.user}>`,
        });
      } catch (e) {
        console.error("slack reply failed", e);
        reply = "Something went wrong on my side. Please try again.";
      }
      for (const part of chunkText(reply, 3500))
        await slackApi(deps, "chat.postMessage", { channel: ev.channel, thread_ts: threadTs, text: part });
      await slackApi(deps, "reactions.remove", { channel: ev.channel, timestamp: ev.ts, name: "eyes" }).catch(() => undefined);
    },
  };
}

/** Slack app manifest: paste into api.slack.com/apps → Create New App → From a manifest. */
export function slackManifest(baseUrl: string) {
  return {
    display_information: {
      name: "Orderable",
      description: "Order lunch, catering and coffee from local food businesses.",
      background_color: "#1a0a00",
    },
    features: {
      app_home: { home_tab_enabled: false, messages_tab_enabled: true, messages_tab_read_only_enabled: false },
      bot_user: { display_name: "Orderable", always_online: true },
      slash_commands: [
        {
          command: "/order",
          url: `${baseUrl}/slack/commands`,
          description: "Order food from local spots",
          usage_hint: "lunch for 8 tomorrow at noon, 2 vegetarian, under $20 each",
          should_escape: false,
        },
      ],
    },
    oauth_config: {
      scopes: { bot: ["app_mentions:read", "chat:write", "commands", "im:history", "reactions:write", "users:read"] },
    },
    settings: {
      event_subscriptions: { request_url: `${baseUrl}/slack/events`, bot_events: ["app_mention", "message.im"] },
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  };
}

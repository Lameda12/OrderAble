import { after } from "next/server";
import { chatAgent } from "@/lib/demo-server";
import { TelegramApi, type TelegramUpdate, handleTelegramUpdate, verifyTelegramSecret } from "@/lib/orderable/channels/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Telegram webhook. Register it once:
 *   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
 *     -d url=https://<host>/api/telegram -d secret_token=$TELEGRAM_WEBHOOK_SECRET
 */
export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!token || !process.env.ANTHROPIC_API_KEY)
    return Response.json({ error: "Telegram bot not configured: set TELEGRAM_BOT_TOKEN and ANTHROPIC_API_KEY" }, { status: 503 });
  if (!verifyTelegramSecret(request.headers.get("x-telegram-bot-api-secret-token"), secret))
    return Response.json({ error: "bad secret" }, { status: 401 });

  const update = (await request.json()) as TelegramUpdate;
  // Answer Telegram right away; the agent keeps working after the response is sent.
  after(() => handleTelegramUpdate(update, chatAgent(), new TelegramApi(token)));
  return Response.json({ ok: true });
}

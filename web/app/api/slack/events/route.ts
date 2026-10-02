import { after } from "next/server";
import { chatAgent } from "@/lib/demo-server";
import { handleSlackRequest } from "@/lib/orderable/channels/slack";
import { ownerIds } from "@/lib/orderable/stock-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Slack Events API and slash commands share one handler: signature check, 3 s ack, work after. */
export async function POST(request: Request) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!botToken || !signingSecret || !process.env.ANTHROPIC_API_KEY)
    return Response.json(
      { error: "Slack app not configured: set SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET and ANTHROPIC_API_KEY" },
      { status: 503 },
    );
  const result = handleSlackRequest(await request.text(), request.headers, {
    agent: chatAgent(),
    botToken,
    signingSecret,
    owners: ownerIds(process.env.ORDERABLE_OWNER_SLACK_IDS),
  });
  if (result.background) after(result.background);
  return new Response(result.body, { status: result.status, headers: { "content-type": result.contentType } });
}

import { slackManifest } from "@/lib/orderable/channels/slack";

export const dynamic = "force-dynamic";

/** Ready-to-paste Slack app manifest for this deployment. */
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return Response.json(slackManifest(`${origin}/api`));
}

// Slash commands use the same signed-request handler as events.
export { POST } from "../events/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { demoService } from "@/lib/demo-server";
import { runTeamLunchDemo } from "@/lib/orderable/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runs the team-lunch scenario through a real MCP client and server. Fresh state every run. */
export async function GET() {
  try {
    const steps = await runTeamLunchDemo(demoService());
    return Response.json({ steps, generated_at: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

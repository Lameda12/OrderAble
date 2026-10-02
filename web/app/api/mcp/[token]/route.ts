import { mcpHandler } from "@/lib/demo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, accept, mcp-session-id, mcp-protocol-version",
  "access-control-expose-headers": "mcp-session-id",
};

async function handle(request: Request) {
  const res = await mcpHandler()(request);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = () => new Response(null, { status: 204, headers: cors });

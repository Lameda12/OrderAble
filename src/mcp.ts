import { timingSafeEqual } from "node:crypto";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { OrderableService } from "./service.js";
import { registerTool } from "./tools/define.js";
import { tools } from "./tools/index.js";
import { ownerTools } from "./tools/owner.js";

/*
 * Transport-agnostic MCP wiring with no native or filesystem dependencies, so it can run
 * in serverless/edge runtimes. Node-specific entry points live in server.ts.
 */

export const VERSION = "0.1.0";

const INSTRUCTIONS = `Orderable exposes a food business (restaurant, cafe, bakery, delivery) to agents.
Typical flow: list_locations → search_menu → (get_item / check_availability) → quote_order → place_order → get_order_status.
For groups: plan_group_order → quote_order with its lines.
Rules: money is integer minor units with a currency. Every price/availability carries as_of and ttl_seconds; re-check stale data. Allergen "unknown" is never safe. place_order needs a fresh quote, an idempotency_key, and confirm: true after the customer approves the total. Errors carry a code and suggested_next_tool.
Static info without tool calls: orderable://policies and orderable://menu/{location_id}.`;

/** Build an MCP server with all nine tools and the two resources registered. */
const OWNER_INSTRUCTIONS = `

This connection belongs to the business owner, so the owner_* tools are available. Use them to set up and change the menu from whatever the owner gives you: a conversation, pasted text, or a photo of the menu. Start with owner_get_setup. Ask one question at a time. Never guess allergens, prices, hours or addresses.`;

export function createMcpServer(service: OrderableService, opts: { owner?: boolean } = {}): McpServer {
  const server = new McpServer(
    { name: "orderable", version: VERSION },
    { instructions: opts.owner ? INSTRUCTIONS + OWNER_INSTRUCTIONS : INSTRUCTIONS },
  );

  for (const def of tools) registerTool(server, service, def as never);
  if (opts.owner) for (const def of ownerTools) registerTool(server, service, def as never);

  server.registerResource(
    "menu",
    new ResourceTemplate("orderable://menu/{location_id}", {
      list: async () => ({
        resources: (await service.adapter.listLocations()).map((l) => ({
          uri: `orderable://menu/${l.id}`,
          name: `${l.name} menu`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Menu by location",
      description: "Full menu for a location: categories, items, modifiers, allergens, and availability with as_of/ttl_seconds.",
      mimeType: "application/json",
    },
    async (uri, { location_id }) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(await service.menuResource(String(location_id))),
        },
      ],
    }),
  );

  server.registerResource(
    "policies",
    "orderable://policies",
    {
      title: "Merchant and agent policies",
      description: "Cancellation, refund, payment and delivery-fee policies, plus the agent spending policy and ordering rules.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(await service.policiesResource()) }],
    }),
  );

  return server;
}

function safeEqual(given: string, token: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Accepts `Authorization: Bearer <token>`, or the token as the last path segment
 * (`/mcp/<token>`) for MCP clients that can only be given a URL, such as connector UIs.
 * Treat such URLs as secrets.
 */
export function requestAuthorized(request: Request, token: string) {
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  if (bearer && safeEqual(bearer[1]!.trim(), token)) return true;
  const inPath = /\/mcp\/([^/?#]+)\/?$/.exec(new URL(request.url).pathname);
  return !!inPath && safeEqual(decodeURIComponent(inPath[1]!), token);
}

/**
 * Stateless Streamable HTTP handler on web-standard Request/Response. Works in Node,
 * Vercel functions, Cloudflare Workers, Deno. Requires `Authorization: Bearer <token>`.
 */
/**
 * The token decides the role: the customer token gets the ordering tools; the owner token
 * (if set) also gets the owner_* setup tools.
 */
export function createHttpHandler(service: OrderableService, token: string, opts: { ownerToken?: string | undefined } = {}) {
  if (!token) throw new Error("HTTP transport requires a bearer token");
  return async (request: Request): Promise<Response> => {
    const owner = !!opts.ownerToken && requestAuthorized(request, opts.ownerToken);
    if (!owner && !requestAuthorized(request, token))
      return new Response(JSON.stringify({ error: "unauthorized", hint: "Send Authorization: Bearer <ORDERABLE_TOKEN>, or use the URL /mcp/<ORDERABLE_TOKEN>" }), {
        status: 401,
        headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="orderable"' },
      });
    const server = createMcpServer(service, { owner });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      void transport.close();
      void server.close();
    }
  };
}


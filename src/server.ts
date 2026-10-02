import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FileAdapter } from "./adapters/file.js";
import { MockAdapter } from "./adapters/mock.js";
import { SquareAdapter } from "./adapters/square.js";
import type { Adapter } from "./adapters/types.js";
import type { OrderableConfig } from "./config.js";
import { VERSION, createHttpHandler, createMcpServer } from "./mcp.js";
import { OrderableService } from "./service.js";
import { SqliteStore, type Store } from "./store.js";

export { VERSION, createHttpHandler, createMcpServer } from "./mcp.js";

export function createAdapter(config: OrderableConfig): Adapter {
  switch (config.adapter) {
    case "mock":
      return new MockAdapter();
    case "square":
      return new SquareAdapter();
    case "file":
      return new FileAdapter(config.menu);
  }
}

export function createService(config: OrderableConfig, opts: { adapter?: Adapter; store?: Store; now?: () => Date } = {}) {
  return new OrderableService({
    adapter: opts.adapter ?? createAdapter(config),
    store: opts.store ?? new SqliteStore(config.database),
    config,
    ...(opts.now ? { now: opts.now } : {}),
  });
}

export async function runStdio(service: OrderableService) {
  const server = createMcpServer(service);
  await server.connect(new StdioServerTransport());
  // stdout belongs to the protocol; log to stderr.
  console.error(`orderable ${VERSION} on stdio (adapter=${service.adapter.name}, dry_run=${service.config.dry_run})`);
}

export async function toWebRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(new URL(req.url ?? "/", origin), {
    method: req.method ?? "GET",
    headers,
    ...(body && req.method !== "GET" && req.method !== "HEAD" ? { body } : {}),
  });
}

export async function writeWebResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
}

export async function runHttp(service: OrderableService, opts: { port: number; host: string; token: string }) {
  const handle = createHttpHandler(service, opts.token);
  const origin = `http://${opts.host}:${opts.port}`;
  const http = createHttpServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? "/", origin).pathname;
      if (path === "/health") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, version: VERSION, adapter: service.adapter.name, dry_run: service.config.dry_run }));
        return;
      }
      if (path !== "/mcp" && !path.startsWith("/mcp/")) {
        res.statusCode = 404;
        res.end("Not found. MCP endpoint is /mcp");
        return;
      }
      await writeWebResponse(res, await handle(await toWebRequest(req, origin)));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
  });
  await new Promise<void>((resolve) => http.listen(opts.port, opts.host, resolve));
  console.error(`orderable ${VERSION} on ${origin}/mcp (adapter=${service.adapter.name}, dry_run=${service.config.dry_run})`);
  return http;
}

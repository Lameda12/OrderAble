import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createHttpHandler, createMcpServer } from "../src/mcp.js";
import { WED_NOON, customer, officeAddress, setup } from "./helpers.js";

async function connect() {
  const ctx = setup();
  const server = createMcpServer(ctx.service);
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { type: string; text: string }[])[0]!.text;
    // Success: structuredContent and text carry the same JSON. Errors: text only.
    if (!res.isError) expect(JSON.parse(text)).toEqual(res.structuredContent);
    return { isError: !!res.isError, data: (res.structuredContent ?? JSON.parse(text)) as any };
  };
  return { ...ctx, client, call };
}

describe("MCP surface", () => {
  it("exposes the nine tools with descriptions and output schemas", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "list_locations",
      "search_menu",
      "get_item",
      "check_availability",
      "plan_group_order",
      "quote_order",
      "place_order",
      "get_order_status",
      "cancel_order",
    ]);
    for (const t of tools) {
      expect(t.description!.length).toBeGreaterThan(150);
      expect(t.outputSchema).toBeTruthy();
    }
    expect(tools.find((t) => t.name === "search_menu")!.annotations?.readOnlyHint).toBe(true);
  });

  it("serves menu and policy resources", async () => {
    const { client } = await connect();
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("orderable://policies");
    expect(resources.map((r) => r.uri)).toContain("orderable://menu/crumb-quinpool");
    const menu = await client.readResource({ uri: "orderable://menu/crumb-quinpool" });
    const parsed = JSON.parse((menu.contents[0] as { text: string }).text);
    expect(parsed.as_of).toBeTruthy();
    expect(parsed.categories.length).toBeGreaterThan(3);
    const policies = JSON.parse(((await client.readResource({ uri: "orderable://policies" })).contents[0] as { text: string }).text);
    expect(policies.merchants[0].cancellation.summary).toMatch(/Free cancellation/);
    expect(policies.ordering_rules.dry_run).toBe(true);
  });

  it("runs the full agent flow through every tool, with outputs matching their schemas", async () => {
    const { call } = await connect();
    const locs = await call("list_locations", { postal_code: "B3J 3N4", fulfillment: "delivery" });
    expect(locs.isError).toBe(false);
    expect(locs.data.locations[0].id).toBe("northline-barrington");

    const menu = await call("search_menu", { location_id: "northline-barrington", dietary: ["gluten_free"], query: "bowl" });
    expect(menu.data.items.map((i: { id: string }) => i.id)).toEqual(["nl-harvest-bowl"]);

    const item = await call("get_item", { item_id: "nl-latte" });
    expect(item.data.required_modifier_groups).toEqual(["size", "milk", "temperature"]);

    const avail = await call("check_availability", {
      location_id: "crumb-quinpool",
      item_ids: ["crumb-chocolate-cake", "crumb-butter-croissant"],
      desired_time: WED_NOON,
    });
    expect(avail.data.availability.map((a: { orderable: boolean }) => a.orderable)).toEqual([false, true]);

    const plan = await call("plan_group_order", {
      location_id: "northline-barrington",
      headcount: 12,
      budget_per_person: 2000,
      dietary_requirements: { vegetarian: 3, gluten_free: 1 },
      desired_time: WED_NOON,
      fulfillment: "delivery",
    });
    expect(plan.isError).toBe(false);

    const quote = await call("quote_order", {
      location_id: "northline-barrington",
      lines: plan.data.lines,
      fulfillment: "delivery",
      desired_time: WED_NOON,
      delivery_address: officeAddress,
      headcount: 12,
    });
    expect(quote.isError).toBe(false);

    const placed = await call("place_order", { quote_id: quote.data.quote_id, idempotency_key: "mcp-flow-0001", customer, confirm: true });
    expect(placed.isError).toBe(false);
    const status = await call("get_order_status", { order_id: placed.data.order.order_id });
    expect(status.data.status).toBe("received");
    const cancelled = await call("cancel_order", { order_id: placed.data.order.order_id, reason: "test" });
    expect(cancelled.data.cancelled).toBe(true);
  });

  it("returns structured errors with codes and next-tool hints", async () => {
    const { call } = await connect();
    const res = await call("quote_order", {
      location_id: "crumb-hydrostone",
      lines: [{ item_id: "crumb-morning-bun", quantity: 1 }],
      fulfillment: "pickup",
    });
    expect(res.isError).toBe(true);
    expect(res.data.error.code).toBe("ITEM_SOLD_OUT");
    expect(res.data.error.suggested_next_tool).toBe("search_menu");
  });

  it("rejects place_order without confirm: true at the schema level", async () => {
    const { client } = await connect();
    const res = await client.callTool({
      name: "place_order",
      arguments: { quote_id: "q", idempotency_key: "abcdefgh", customer, confirm: false },
    });
    expect(res.isError).toBe(true);
  });
});

describe("HTTP transport", () => {
  it("requires a bearer token and serves MCP over Streamable HTTP", async () => {
    const { service } = setup();
    const handle = createHttpHandler(service, "s3cret-token");
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    const denied = await handle(new Request("http://x/mcp", { method: "POST", headers, body }));
    expect(denied.status).toBe(401);
    const wrong = await handle(new Request("http://x/mcp", { method: "POST", headers: { ...headers, authorization: "Bearer nope" }, body }));
    expect(wrong.status).toBe(401);
    const ok = await handle(
      new Request("http://x/mcp", { method: "POST", headers: { ...headers, authorization: "Bearer s3cret-token" }, body }),
    );
    expect(ok.status).toBe(200);
    const json = await ok.json();
    expect(json.result.tools).toHaveLength(9);
  });
});

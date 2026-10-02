import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./mcp.js";
import type { OrderableService } from "./service.js";
import { nextLocalTime } from "./time.js";

export interface DemoStep {
  kind: "user" | "agent" | "tool";
  text?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
  ms?: number;
}

/**
 * The team-lunch scenario, driven through a real MCP client against a real Orderable server.
 * Agent narration is scripted; every tool result is live.
 */
export async function runTeamLunchDemo(service: OrderableService): Promise<DemoStep[]> {
  const server = createMcpServer(service);
  const client = new Client({ name: "orderable-demo-agent", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);

  const steps: DemoStep[] = [];
  const say = (kind: "user" | "agent", text: string) => steps.push({ kind, text });
  const call = async (tool: string, args: Record<string, unknown>) => {
    const t0 = performance.now();
    const res = await client.callTool({ name: tool, arguments: args });
    const text = (res.content as { text: string }[])[0]!.text;
    const result = res.structuredContent ?? JSON.parse(text);
    steps.push({ kind: "tool", tool, args, result, isError: !!res.isError, ms: Math.round(performance.now() - t0) });
    return result as any;
  };

  const office = {
    line1: "1801 Hollis St",
    city: "Halifax",
    region: "NS",
    postal_code: "B3J 3N4",
    country: "CA",
    lat: 44.6488,
    lng: -63.5752,
  };

  say(
    "user",
    "Order lunch for the team tomorrow at noon. 12 people: 3 vegetarians, 1 gluten-free. Keep it under $20 a head, delivered to 1801 Hollis St.",
  );
  say("agent", "Finding places that deliver to B3J.");
  const locs = await call("list_locations", { postal_code: "B3J 3N4", fulfillment: "delivery" });
  const loc = locs.locations.find((l: { delivers_to_you: string }) => l.delivers_to_you === "yes") ?? locs.locations[0];
  const location = (await service.adapter.listLocations()).find((l) => l.id === loc.id)!;
  const noon = nextLocalTime(location, service.now(), "12:00", { notToday: true }).toISOString();

  say("agent", `${loc.name} delivers there. Planning a cart for 12 that covers every diet.`);
  const plan = await call("plan_group_order", {
    location_id: loc.id,
    headcount: 12,
    budget_per_person: 2000,
    dietary_requirements: { vegetarian: 3, gluten_free: 1 },
    desired_time: noon,
    fulfillment: "delivery",
  });

  say("agent", "Everyone's covered. Locking in a price.");
  const quote = await call("quote_order", {
    location_id: loc.id,
    lines: plan.lines,
    fulfillment: "delivery",
    desired_time: noon,
    delivery_address: office,
    headcount: 12,
  });

  const dollars = (m: { amount: number }) => `$${(m.amount / 100).toFixed(2)}`;
  say(
    "agent",
    `${plan.line_details.map((l: { quantity: number; name: string }) => `${l.quantity} ${l.name}`).join(", ")}. ` +
      `Total ${dollars(quote.total)} with tax and delivery, ${dollars(plan.estimate.per_person)} a head. Place it?`,
  );
  say("user", "Yes. Put it on the Harbourline account.");

  const key = randomUUID();
  const order = await call("place_order", {
    quote_id: quote.quote_id,
    idempotency_key: key,
    customer: { name: "Priya Shah", email: "priya@harbourline.example", company: "Harbourline Labs" },
    confirm: true,
    payment_method: "invoice",
  });

  say("agent", "The connection dropped before I saw the confirmation. Retrying with the same idempotency key.");
  await call("place_order", {
    quote_id: quote.quote_id,
    idempotency_key: key,
    customer: { name: "Priya Shah", email: "priya@harbourline.example", company: "Harbourline Labs" },
    confirm: true,
    payment_method: "invoice",
  });

  say("agent", "Same order back, no duplicate. Checking status.");
  await call("get_order_status", { order_id: order.order.order_id });
  say(
    "agent",
    `Done. Order ${order.order.order_id} arrives ${new Date(quote.eta).toLocaleString("en-CA", {
      timeZone: location.timezone,
      weekday: "long",
    })} at ${new Date(quote.eta).toLocaleTimeString("en-CA", {
      timeZone: location.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })}. Billed to Harbourline, Net 30.` +
      (order.order.dry_run ? " (DRY_RUN is on, so this was recorded but not sent to the kitchen.)" : ""),
  );

  await client.close();
  await server.close();
  return steps;
}

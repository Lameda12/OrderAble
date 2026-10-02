import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { FileAdapter } from "../src/adapters/file.js";
import { defaultConfig } from "../src/config.js";
import { createHttpHandler, createMcpServer } from "../src/mcp.js";
import { OrderableService } from "../src/service.js";
import { MemoryStore } from "../src/store-memory.js";

const now = () => new Date("2026-10-07T13:00:00Z"); // Wednesday 10:00 in Halifax

function freshOwner() {
  const dir = mkdtempSync(join(tmpdir(), "orderable-owner-"));
  const menu = join(dir, "menu.yaml");
  const service = new OrderableService({
    adapter: new FileAdapter(menu, { now }),
    store: new MemoryStore(),
    config: defaultConfig({ adapter: "file", menu }),
    now,
  });
  return { menu, service };
}

async function connect(service: OrderableService, owner: boolean) {
  const server = createMcpServer(service, { owner });
  const client = new Client({ name: "owner-test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { text: string }[])[0]!.text;
    return { isError: !!res.isError, data: (res.structuredContent ?? JSON.parse(text)) as any };
  };
  return { client, call };
}

const business = {
  name: "Rosie's Bakeshop",
  type: "bakery",
  locations: [
    {
      name: "Rosie's North End",
      address: { line1: "2500 Agricola St", city: "Halifax", region: "NS", postal_code: "B3K 4C1" },
      hours: { mon: "closed", tue: "07:00-17:00", wed: "07:00-17:00", thu: "07:00-17:00", fri: "07:00-17:00", sat: "08:00-15:00", sun: "08:00-15:00" },
      fulfillment: ["pickup", "delivery"],
      delivery: { postal_codes: ["B3K", "B3L"], fee: 4.5, minimum: 20 },
      tax_rate: 14,
    },
  ],
};

// What an assistant would extract from a photo of a chalkboard menu.
const fromMenuPhoto = [
  { name: "Butter Croissant", category: "Pastries", price: 3.75, allergens: { contains: ["wheat", "gluten", "milk", "egg"] }, dietary: ["vegetarian"] },
  { name: "Ham & Swiss Croissant", category: "Lunch", price: 9.5, role: "main" },
  { name: "Tomato Soup", category: "Lunch", price: 7, description: "With a slice of sourdough", role: "main" },
  {
    name: "Latte",
    category: "Coffee",
    price: 5,
    modifiers: [{ name: "Milk", min: 1, max: 1, options: [{ name: "Whole" }, { name: "Oat", price: 0.75 }] }],
  },
];

describe("owner setup over MCP", () => {
  it("goes from an empty folder to an orderable menu by conversation", async () => {
    const { menu, service } = freshOwner();
    const owner = await connect(service, true);

    const empty = await owner.call("owner_get_setup");
    expect(empty.data.has_menu).toBe(false);
    expect(empty.data.next_step).toMatch(/owner_save_business/);

    const early = await owner.call("owner_upsert_items", { items: fromMenuPhoto });
    expect(early.isError).toBe(true);
    expect(early.data.error.suggested_next_tool).toBe("owner_save_business");

    const saved = await owner.call("owner_save_business", business);
    expect(saved.isError).toBe(false);
    expect(saved.data.location_ids).toEqual(["rosie-s-north-end"]);
    expect(existsSync(menu)).toBe(true);

    const items = await owner.call("owner_upsert_items", { items: fromMenuPhoto });
    expect(items.isError).toBe(false);
    expect(items.data.created).toEqual(["butter-croissant", "ham-and-swiss-croissant", "tomato-soup", "latte"]);
    // Items the owner hasn't described allergens for are named, so the assistant asks instead of guessing.
    expect(items.data.next_step).toMatch(/Allergens are unknown for: Ham & Swiss Croissant, Tomato Soup, Latte/);

    const setup = await owner.call("owner_get_setup");
    expect(setup.data.has_menu).toBe(true);
    expect(setup.data.readiness.score).toBeGreaterThan(50);
    expect(setup.data.items.find((i: { id: string }) => i.id === "tomato-soup").has_allergen_info).toBe(false);

    // Customers' agents can order what the owner just set up.
    const quote = await service.quoteOrder({
      location_id: "rosie-s-north-end",
      lines: [
        { item_id: "tomato-soup", quantity: 2, modifiers: [] },
        { item_id: "latte", quantity: 1, modifiers: [{ group_id: "milk", option_id: "oat" }] },
      ],
      fulfillment: "pickup",
    });
    expect(quote.subtotal.amount).toBe(2 * 700 + 575);
    const allergens = (await service.getItem("tomato-soup")).item.allergens;
    expect(Object.values(allergens).every((s) => s === "unknown")).toBe(true);

    // Updating one item doesn't touch the others, and a price change shows up immediately.
    const update = await owner.call("owner_upsert_items", {
      items: [{ name: "Tomato Soup", category: "Lunch", price: 7.5, allergens: { contains: ["milk", "wheat", "gluten"] } }],
    });
    expect(update.data.updated).toEqual(["tomato-soup"]);
    expect((await service.getItem("tomato-soup")).item.price.amount).toBe(750);
    expect((await service.getItem("tomato-soup")).item.description).toBe("With a slice of sourdough");

    const stock = await owner.call("owner_update_stock", { message: "out of tomato soup" });
    expect(stock.data.changed).toBe(true);
    const avail = await service.checkAvailability({ location_id: "rosie-s-north-end", item_ids: ["tomato-soup"] });
    expect(avail.availability[0]!.status).toBe("sold_out");

    const removed = await owner.call("owner_remove_items", { item_ids: ["ham-and-swiss-croissant"] });
    expect(removed.data.removed).toBe(1);

    // The file stays readable and valid for anyone who does open it.
    expect(readFileSync(menu, "utf8")).toMatch(/^# Menu for Orderable/);
  });

  it("saves nothing when input doesn't validate", async () => {
    const { menu, service } = freshOwner();
    const owner = await connect(service, true);
    await owner.call("owner_save_business", business);
    const before = readFileSync(menu, "utf8");
    const bad = await owner.call("owner_save_business", {
      ...business,
      locations: [{ ...business.locations[0], hours: { mon: "7am to 6pm" } }],
    });
    expect(bad.isError).toBe(true);
    expect(bad.data.error.message).toMatch(/^Not saved\./);
    expect(readFileSync(menu, "utf8")).toBe(before);
  });

  it("keeps owner tools away from customers' agents", async () => {
    const { service } = freshOwner();
    const customer = await connect(service, false);
    const names = (await customer.client.listTools()).tools.map((t) => t.name);
    expect(names.some((n) => n.startsWith("owner_"))).toBe(false);

    const handle = createHttpHandler(service, "customer-token", { ownerToken: "owner-token" });
    const list = async (token: string) => {
      const res = await handle(
        new Request("http://x/mcp", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
        }),
      );
      return res.status === 200 ? ((await res.json()).result.tools as { name: string }[]).map((t) => t.name) : res.status;
    };
    expect((await list("customer-token")) as string[]).toHaveLength(9);
    expect((await list("owner-token")) as string[]).toHaveLength(14);
    expect(await list("wrong")).toBe(401);
  });
});

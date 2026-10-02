import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileAdapter } from "../src/adapters/file.js";
import { MockAdapter } from "../src/adapters/mock.js";
import { OrderableAgent } from "../src/agent.js";
import { TelegramApi, handleTelegramUpdate } from "../src/channels/telegram.js";
import { applyStockMessage, parseStockMessage } from "../src/stock-text.js";
import { menuTemplate } from "../src/templates.js";
import { setup } from "./helpers.js";

describe("parseStockMessage", () => {
  const cases: [string, ReturnType<typeof parseStockMessage>][] = [
    ["out of croissants", { status: "sold_out", quantity: 0, itemQuery: "croissants", locationQuery: null }],
    ["We're out of butter croissants!", { status: "sold_out", quantity: 0, itemQuery: "butter croissants", locationQuery: null }],
    ["86 the soup at Quinpool", { status: "sold_out", quantity: 0, itemQuery: "soup", locationQuery: "quinpool" }],
    ["sourdough is sold out", { status: "sold_out", quantity: 0, itemQuery: "sourdough", locationQuery: null }],
    ["6 morning buns left", { status: "in_stock", quantity: 6, itemQuery: "morning buns", locationQuery: null }],
    ["only 2 lemon cake slices left", { status: "low", quantity: 2, itemQuery: "lemon cake slices", locationQuery: null }],
    ["cold brew: 0", { status: "sold_out", quantity: 0, itemQuery: "cold brew", locationQuery: null }],
    ["running low on lattes", { status: "low", quantity: null, itemQuery: "lattes", locationQuery: null }],
    ["sourdough is back", { status: "in_stock", quantity: null, itemQuery: "sourdough", locationQuery: null }],
    ["back in stock: galette", { status: "in_stock", quantity: null, itemQuery: "galette", locationQuery: null }],
    ["can you order me lunch for 12?", null],
    ["what's on the menu", null],
  ];
  for (const [text, expected] of cases)
    it(JSON.stringify(text), () => {
      expect(parseStockMessage(text)).toEqual(expected);
    });

  it("does not misread item names that end in x", () => {
    expect(parseStockMessage("pastry box 6")).toBeNull();
  });
});

describe("applyStockMessage", () => {
  it("marks a uniquely matched item sold out everywhere it is sold, and agents see it", async () => {
    const { adapter, service } = setup();
    const res = await applyStockMessage(adapter, "out of butter croissants");
    expect(res.changes.map((c) => c.location_id).sort()).toEqual(["crumb-hydrostone", "crumb-quinpool"]);
    expect(res.message).toMatch(/^Done\. Butter Croissant: sold out at /);
    const avail = await service.checkAvailability({ location_id: "crumb-quinpool", item_ids: ["crumb-butter-croissant"] });
    expect(avail.availability[0]!.status).toBe("sold_out");
    expect(avail.availability[0]!.orderable).toBe(false);
  });

  it("asks instead of guessing when several items match", async () => {
    const { adapter } = setup();
    const res = await applyStockMessage(adapter, "out of croissants");
    expect(res.changes).toEqual([]);
    expect(res.message).toMatch(/matches \d items: .*Butter Croissant.*Almond Croissant.*Which one\?/);
  });

  it("scopes to one location with 'at <place>'", async () => {
    const { adapter } = setup();
    const res = await applyStockMessage(adapter, "2 morning buns left at quinpool");
    expect(res.changes).toEqual([{ location_id: "crumb-quinpool", item_id: "crumb-morning-bun", status: "low", quantity: 2 }]);
  });

  it("refuses a location that doesn't sell the item", async () => {
    const { adapter } = setup();
    const res = await applyStockMessage(adapter, "out of chocolate celebration cake at hydrostone");
    expect(res.changes).toEqual([]);
    expect(res.message).toMatch(/isn't sold at "hydrostone"/);
  });

  it("suggests close matches for unknown items", async () => {
    const { adapter } = setup();
    const res = await applyStockMessage(adapter, "out of blueberry scones");
    expect(res.changes).toEqual([]);
    expect(res.message).toMatch(/couldn't find "blueberry scones".*Wild Blueberry Muffin/);
  });

  it("ignores messages that aren't stock updates", async () => {
    const res = await applyStockMessage(new MockAdapter(), "lunch for 8 tomorrow please");
    expect(res.handled).toBe(false);
  });

  it("writes changes into menu.yaml, keeps comments, and refreshes the stock timestamp", async () => {
    const dir = mkdtempSync(join(tmpdir(), "orderable-stock-"));
    const path = join(dir, "menu.yaml");
    const text = menuTemplate({
      type: "bakery",
      name: "Test Bakery",
      id: "test-bakery",
      line1: "1 Main St",
      city: "Halifax",
      region: "NS",
      postal_code: "B3J 1A1",
      timezone: "America/Halifax",
      tax_rate: 14,
    }).replace("stock_updated_at: live", "stock_updated_at: 2026-10-01T08:00:00Z");
    writeFileSync(path, text);
    const now = () => new Date("2026-10-07T13:00:00Z");
    const adapter = new FileAdapter(path, { now });

    const res = await applyStockMessage(adapter, "only 2 sourdough left");
    expect(res.changes).toHaveLength(1);
    const saved = readFileSync(path, "utf8");
    expect(saved).toMatch(/stock: \{ status: low, quantity: 2 \}/);
    expect(saved).toMatch(/stock_updated_at: 2026-10-07T13:00:00.000Z/);
    expect(saved).toMatch(/# Lead-time cakes: agents will refuse/); // owner's comments survive
    const [level] = await adapter.getAvailability("test-bakery-main", ["sourdough"]);
    expect(level).toMatchObject({ status: "low", quantity: 2, as_of: "2026-10-07T13:00:00.000Z" });
  });
});

describe("owner stock updates over Telegram", () => {
  it("lets allow-listed owners change stock and sends everyone else to the ordering agent", async () => {
    const { service } = setup();
    const calls: { url: string; body: any }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ ok: true, result: true }));
    }) as typeof fetch;
    let agentCalls = 0;
    const fakeClaude = {
      beta: {
        messages: {
          create: async () => {
            agentCalls++;
            return { id: "m", type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "Sure!" }] };
          },
        },
      },
    } as never;
    const agent = new OrderableAgent({ service, client: fakeClaude });
    const api = new TelegramApi("1:x", fetchImpl);
    const msg = (id: number, from: number, text: string) => ({
      update_id: id,
      message: { message_id: id, chat: { id: from, type: "private" }, from: { id: from, first_name: "Sam" }, text },
    });

    await handleTelegramUpdate(msg(101, 555, "out of butter croissants"), agent, api, { owners: new Set(["555"]) });
    expect(calls.at(-1)!.body.text).toMatch(/^Done\. Butter Croissant: sold out/);
    expect(agentCalls).toBe(0);

    await handleTelegramUpdate(msg(102, 999, "out of butter croissants"), agent, api, { owners: new Set(["555"]) });
    expect(agentCalls).toBe(1); // a customer can't change stock; it's just a chat message
  });
});

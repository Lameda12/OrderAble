import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileAdapter } from "../src/adapters/file.js";
import { defaultConfig } from "../src/config.js";
import { runDoctor } from "../src/doctor.js";
import { lintMenu } from "../src/lint.js";
import { OrderableService } from "../src/service.js";
import { MemoryStore } from "../src/store-memory.js";
import { menuTemplate } from "../src/templates.js";

const answers = {
  name: "Test Bakery",
  id: "test-bakery",
  line1: "1 Main St",
  city: "Halifax",
  region: "NS",
  postal_code: "B3J 1A1",
  timezone: "America/Halifax",
  tax_rate: 14,
};
const now = () => new Date("2026-10-07T13:00:00Z");

function writeMenu(text: string) {
  const dir = mkdtempSync(join(tmpdir(), "orderable-"));
  const path = join(dir, "menu.yaml");
  writeFileSync(path, text);
  return path;
}

describe("file adapter", () => {
  for (const type of ["restaurant", "cafe", "bakery", "delivery"] as const) {
    it(`init template for ${type} validates cleanly and scores 100 in doctor`, async () => {
      const text = menuTemplate({ ...answers, type });
      expect(lintMenu(text).findings).toEqual([]);
      const report = await runDoctor(new FileAdapter(writeMenu(text), { now }), defaultConfig({ adapter: "file" }), now());
      expect(report.score).toBe(100);
    });
  }

  it("serves menu.yaml through the full order flow and hot-reloads edits", async () => {
    const path = writeMenu(menuTemplate({ ...answers, type: "bakery" }));
    const adapter = new FileAdapter(path, { now });
    const service = new OrderableService({ adapter, store: new MemoryStore(), config: defaultConfig({ adapter: "file" }), now });
    const q = await service.quoteOrder({
      location_id: "test-bakery-main",
      lines: [{ item_id: "butter-croissant", quantity: 2, modifiers: [] }],
      fulfillment: "pickup",
    });
    expect(q.subtotal.amount).toBe(750);
    const { order } = await service.placeOrder({ quote_id: q.quote_id, idempotency_key: "file-key-0001", customer: { name: "A", phone: "902-555-0100" }, confirm: true });
    expect(order.status).toBe("received");

    const text = menuTemplate({ ...answers, type: "bakery" }).replace("price: 3.75", "price: 4.25");
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(path, text);
    const item = await service.getItem("butter-croissant");
    expect(item.item.price.amount).toBe(425);
  });

  it("validate explains problems in plain English with line numbers", () => {
    const text = menuTemplate({ ...answers, type: "bakery" })
      .replace("      contains: [wheat, gluten, milk, egg]\n      may_contain: [tree_nut]\n    stock: { status: in_stock, quantity: 36 }", "    stock: { status: in_stock, quantity: 36 }")
      .replace("    allergens:\n    stock: { status: in_stock, quantity: 36 }", "    stock: { status: in_stock, quantity: 36 }")
      .replace("category: breads", "category: bread");
    const { findings } = lintMenu(text);
    const croissant = findings.find((f) => f.message.startsWith("Butter Croissant has no allergen info"));
    expect(croissant?.message).toBe("Butter Croissant has no allergen info, agents will treat it as unknown.");
    expect(croissant?.line).toBeGreaterThan(10);
    expect(findings.find((f) => f.severity === "error")?.message).toMatch(/category "bread"/);
  });

  it("schema errors carry the line they occur on", () => {
    const { findings } = lintMenu("business:\n  id: x\n  name: X\n  type: pizzeria\nlocations: []\nitems: []\n");
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ line: 4, message: expect.stringMatching(/type: must be one of/) }),
        expect.objectContaining({ line: 5, message: expect.stringMatching(/at least one location/) }),
      ]),
    );
  });

  it("catches contradictions between dietary tags and allergens", () => {
    const text = menuTemplate({ ...answers, type: "bakery" }).replace("dietary: [vegan, vegetarian, dairy_free]", "dietary: [vegan, vegetarian, dairy_free, gluten_free]");
    expect(lintMenu(text).findings.find((f) => f.severity === "error")?.message).toMatch(/tagged gluten_free but contains gluten/);
  });
});

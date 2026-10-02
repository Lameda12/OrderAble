import { describe, expect, it } from "vitest";
import { WED_NOON, setup } from "./helpers.js";

describe("plan_group_order", () => {
  it("plans lunch for 12 with 3 vegetarian and 1 gluten-free under $20/person", async () => {
    const { service } = setup();
    const plan = await service.planGroupOrder({
      location_id: "northline-barrington",
      headcount: 12,
      budget_per_person: 2000,
      dietary_requirements: { vegetarian: 3, gluten_free: 1 },
      desired_time: WED_NOON,
      fulfillment: "delivery",
    });
    expect(plan.unmet).toEqual([]);
    expect(plan.coverage.fully_covered).toBe(true);
    expect(plan.coverage.people_with_a_main).toBe(12);
    const gf = plan.coverage.dietary.find((d) => d.requirement === "gluten_free")!;
    const veg = plan.coverage.dietary.find((d) => d.requirement === "vegetarian")!;
    expect(gf.covered).toBe(1);
    expect(veg.covered).toBe(3);
    expect(plan.estimate!.within_budget).toBe(true);
    expect(plan.estimate!.total.amount).toBeLessThanOrEqual(24_000);
    // Lines feed straight into quote_order and match the estimate.
    const quote = await service.quoteOrder({
      location_id: "northline-barrington",
      lines: plan.lines,
      fulfillment: "delivery",
      desired_time: WED_NOON,
      delivery_address: { line1: "1801 Hollis St", city: "Halifax", region: "NS", postal_code: "B3J 3N4", country: "CA" },
      headcount: 12,
    });
    expect(quote.total).toEqual(plan.estimate!.total);
  });

  it("only uses items that actually carry the dietary tag", async () => {
    const { service, adapter } = setup();
    const plan = await service.planGroupOrder({
      location_id: "crumb-quinpool",
      headcount: 6,
      budget_per_person: 2500,
      dietary_requirements: { vegan: 2, gluten_free: 1 },
      desired_time: WED_NOON,
    });
    const items = await Promise.all(plan.coverage.dietary.flatMap((d) => d.items));
    expect(items).toContain("Roasted Veg & Hummus Focaccia");
    expect(plan.coverage.dietary.find((d) => d.requirement === "gluten_free")!.items).toEqual(["Gluten-Free Quinoa Bowl"]);
    // Shared-kitchen risk is surfaced, not hidden.
    expect(plan.warnings.join(" ")).toMatch(/may contain gluten/);
    expect(adapter).toBeTruthy();
  });

  it("reports unmet constraints instead of guessing", async () => {
    const { service, adapter } = setup();
    adapter.setStock("crumb-quinpool", "crumb-quinoa-bowl", "sold_out", 0);
    const plan = await service.planGroupOrder({
      location_id: "crumb-quinpool",
      headcount: 4,
      budget_per_person: 2000,
      dietary_requirements: { gluten_free: 1 },
      desired_time: WED_NOON,
    });
    expect(plan.coverage.fully_covered).toBe(false);
    expect(plan.unmet[0]!.constraint).toBe("gluten_free x1");
  });

  it("reports a budget that cannot cover mains", async () => {
    const { service } = setup();
    const plan = await service.planGroupOrder({
      location_id: "northline-barrington",
      headcount: 10,
      budget_per_person: 800,
      desired_time: WED_NOON,
    });
    expect(plan.unmet.map((u) => u.constraint)).toEqual([expect.stringMatching(/^budget/)]);
  });

  it("is deterministic", async () => {
    const a = setup();
    const b = setup();
    const args = {
      location_id: "northline-barrington",
      headcount: 9,
      budget_per_person: 2200,
      dietary_requirements: { vegan: 2 },
      desired_time: WED_NOON,
    };
    const pa = await a.service.planGroupOrder(args);
    const pb = await b.service.planGroupOrder(args);
    expect(pa.lines).toEqual(pb.lines);
  });
});

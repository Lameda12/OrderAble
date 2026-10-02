import { describe, expect, it } from "vitest";
import { mockCatalog } from "../src/adapters/mock.js";
import { allergenMap, MenuFile, normalizeMenu } from "../src/menu-format.js";
import { Catalog, CustomerContact, Item, Money, OrderLineInput } from "../src/schema.js";

describe("canonical schema", () => {
  it("rejects fractional money and lowercase currency", () => {
    expect(Money.safeParse({ amount: 12.5, currency: "CAD" }).success).toBe(false);
    expect(Money.safeParse({ amount: 1250, currency: "cad" }).success).toBe(false);
    expect(Money.safeParse({ amount: 1250, currency: "CAD" }).success).toBe(true);
  });

  it("requires every allergen in the map", () => {
    const item = mockCatalog().items[0]!;
    const { gluten: _drop, ...partial } = item.allergens;
    expect(Item.safeParse({ ...item, allergens: partial }).success).toBe(false);
    expect(Item.safeParse(item).success).toBe(true);
  });

  it("defaults missing allergen data to unknown, never safe", () => {
    const map = allergenMap({ contains: ["milk"], may_contain: ["peanut"] });
    expect(map.milk).toBe("contains");
    expect(map.peanut).toBe("may_contain");
    expect(map.sesame).toBe("unknown");
    expect(Object.values(allergenMap(undefined)).every((s) => s === "unknown")).toBe(true);
  });

  it("customer contact needs email or phone", () => {
    expect(CustomerContact.safeParse({ name: "A" }).success).toBe(false);
    expect(CustomerContact.safeParse({ name: "A", phone: "902-555-0100" }).success).toBe(true);
  });

  it("order lines need positive integer quantities", () => {
    expect(OrderLineInput.safeParse({ item_id: "x", quantity: 0 }).success).toBe(false);
    expect(OrderLineInput.safeParse({ item_id: "x", quantity: 1.5 }).success).toBe(false);
  });

  it("the seeded mock catalog is a valid canonical Catalog", () => {
    const catalog = mockCatalog();
    expect(Catalog.safeParse(catalog).success).toBe(true);
    expect(catalog.businesses.map((b) => b.name)).toEqual(["Crumb & Co", "Northline Coffee"]);
    const galette = catalog.items.find((i) => i.id === "crumb-fruit-galette")!;
    expect(Object.values(galette.allergens).every((s) => s === "unknown")).toBe(true);
    const cake = catalog.items.find((i) => i.id === "crumb-chocolate-cake")!;
    expect(cake.lead_time_minutes).toBe(2880);
    expect(cake.serves).toBe(12);
  });

  it("menu.yaml format converts dollars, hours and durations", () => {
    const catalog = normalizeMenu(
      MenuFile.parse({
        business: { id: "b", name: "B", type: "bakery" },
        locations: [
          {
            id: "l",
            name: "L",
            address: { line1: "1 Main", city: "Halifax", region: "NS", postal_code: "B3J 1A1" },
            hours: { mon: "07:00-11:00, 12:00-18:00", tue: "closed" },
            tax_rate: 14,
          },
        ],
        categories: [{ id: "c", name: "Cakes" }],
        items: [{ id: "i", name: "Cake", category: "c", price: 42.5, lead_time: "2d" }],
      }),
    );
    expect(catalog.items[0]!.price).toEqual({ amount: 4250, currency: "CAD" });
    expect(catalog.items[0]!.lead_time_minutes).toBe(2880);
    expect(catalog.items[0]!.role).toBe("dessert");
    expect(catalog.locations[0]!.hours).toHaveLength(2);
    expect(catalog.locations[0]!.tax_rate_bps).toBe(1400);
  });
});

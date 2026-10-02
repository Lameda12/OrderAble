import { describe, expect, it } from "vitest";
import { OrderableError } from "../src/errors.js";
import { WED_NOON, customer, officeAddress, setup } from "./helpers.js";

const latte = {
  item_id: "nl-latte",
  quantity: 2,
  modifiers: [
    { group_id: "size", option_id: "large" },
    { group_id: "milk", option_id: "oat" },
    { group_id: "temperature", option_id: "hot" },
  ],
};
const lunch = [{ item_id: "nl-turkey-club", quantity: 2, modifiers: [] }, latte];

async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(OrderableError);
  expect((err as OrderableError).code).toBe(code);
  return err as OrderableError;
}

describe("quote → order happy path", () => {
  it("quotes with itemized pricing, tax, fees and freshness, then places a dry-run order", async () => {
    const { service } = setup();
    const quote = await service.quoteOrder({
      location_id: "northline-barrington",
      lines: lunch,
      fulfillment: "delivery",
      desired_time: WED_NOON,
      delivery_address: officeAddress,
    });
    // 2 x 12.95 + 2 x (5.25 + 1.25 large + 0.75 oat) = 25.90 + 14.50 = 40.40
    expect(quote.subtotal).toEqual({ amount: 4040, currency: "CAD" });
    expect(quote.fees).toEqual([{ code: "delivery", label: "Delivery fee", amount: { amount: 499, currency: "CAD" } }]);
    expect(quote.tax.amount).toBe(Math.round((4040 + 499) * 0.14));
    expect(quote.total.amount).toBe(4040 + 499 + quote.tax.amount);
    expect(quote.policy.allowed).toBe(true);
    expect(quote.as_of).toBeTruthy();
    expect(quote.ttl_seconds).toBe(600);
    expect(new Date(quote.expires_at).getTime() - new Date(quote.as_of).getTime()).toBe(600_000);

    const { order, idempotent_replay } = await service.placeOrder({
      quote_id: quote.quote_id,
      idempotency_key: "key-happy-path-1",
      customer,
      confirm: true,
    });
    expect(idempotent_replay).toBe(false);
    expect(order.status).toBe("received");
    expect(order.dry_run).toBe(true);
    expect(order.total).toEqual(quote.total);
    expect(order.payment.method).toBe("pay_at_pickup");
    const status = await service.getOrderStatus(order.order_id);
    expect(status.timeline[0]!.note).toMatch(/DRY_RUN/);
  });

  it("sends to the adapter when dry run is off, and the status advances with time", async () => {
    const { service, advance } = setup({ config: { dry_run: false } });
    const quote = await service.quoteOrder({ location_id: "northline-barrington", lines: lunch, fulfillment: "pickup" });
    const { order } = await service.placeOrder({ quote_id: quote.quote_id, idempotency_key: "key-live-0001", customer, confirm: true });
    expect(order.dry_run).toBe(false);
    advance(1);
    expect((await service.getOrderStatus(order.order_id)).status).toBe("accepted");
    advance(30);
    const done = await service.getOrderStatus(order.order_id);
    expect(done.status).toBe("ready");
    expect(done.timeline.map((t) => t.status)).toEqual(["received", "accepted", "preparing", "ready"]);
  });

  it("decrements tracked stock after a live order", async () => {
    const { service } = setup({ config: { dry_run: false } });
    const quote = await service.quoteOrder({
      location_id: "crumb-quinpool",
      lines: [{ item_id: "crumb-morning-bun", quantity: 3, modifiers: [] }],
      fulfillment: "pickup",
    });
    await service.placeOrder({ quote_id: quote.quote_id, idempotency_key: "key-bun-0001", customer, confirm: true });
    const avail = await service.checkAvailability({ location_id: "crumb-quinpool", item_ids: ["crumb-morning-bun"] });
    expect(avail.availability[0]!.status).toBe("sold_out");
  });
});

describe("expired quote", () => {
  it("refuses to place an order on a quote older than 10 minutes", async () => {
    const { service, advance } = setup();
    const quote = await service.quoteOrder({ location_id: "northline-barrington", lines: lunch, fulfillment: "pickup" });
    advance(11);
    const err = await expectCode(
      service.placeOrder({ quote_id: quote.quote_id, idempotency_key: "key-expired-1", customer, confirm: true }),
      "QUOTE_EXPIRED",
    );
    expect(err.suggestedNextTool).toBe("quote_order");
  });

  it("refuses unknown quotes: no ad-hoc ordering", async () => {
    const { service } = setup();
    await expectCode(
      service.placeOrder({ quote_id: "q_made_up", idempotency_key: "key-adhoc-01", customer, confirm: true }),
      "QUOTE_NOT_FOUND",
    );
  });
});

describe("idempotent retry", () => {
  it("returns the original order for the same key, never a duplicate", async () => {
    const { service, store, now } = setup();
    const quote = await service.quoteOrder({ location_id: "northline-barrington", lines: lunch, fulfillment: "pickup" });
    const args = { quote_id: quote.quote_id, idempotency_key: "retry-key-0001", customer, confirm: true as const };
    const first = await service.placeOrder(args);
    const second = await service.placeOrder(args);
    expect(second.idempotent_replay).toBe(true);
    expect(second.order.order_id).toBe(first.order.order_id);
    expect(await store.ordersCreatedAfter(new Date(now().getTime() - 3_600_000).toISOString())).toHaveLength(1);
  });

  it("concurrent retries still produce one order", async () => {
    const { service, store, now } = setup();
    const quote = await service.quoteOrder({ location_id: "northline-barrington", lines: lunch, fulfillment: "pickup" });
    const args = { quote_id: quote.quote_id, idempotency_key: "retry-key-0002", customer, confirm: true as const };
    const results = await Promise.all([service.placeOrder(args), service.placeOrder(args), service.placeOrder(args)]);
    expect(new Set(results.map((r) => r.order.order_id)).size).toBe(1);
    expect(await store.ordersCreatedAfter(new Date(now().getTime() - 3_600_000).toISOString())).toHaveLength(1);
  });

  it("rejects reusing a key for a different quote", async () => {
    const { service } = setup();
    const q1 = await service.quoteOrder({ location_id: "northline-barrington", lines: lunch, fulfillment: "pickup" });
    const q2 = await service.quoteOrder({ location_id: "northline-barrington", lines: lunch, fulfillment: "pickup" });
    await service.placeOrder({ quote_id: q1.quote_id, idempotency_key: "shared-key-01", customer, confirm: true });
    await expectCode(
      service.placeOrder({ quote_id: q2.quote_id, idempotency_key: "shared-key-01", customer, confirm: true }),
      "IDEMPOTENCY_KEY_REUSED",
    );
  });

  it("a used quote cannot be ordered again under a new key", async () => {
    const { service } = setup();
    const q = await service.quoteOrder({ location_id: "northline-barrington", lines: lunch, fulfillment: "pickup" });
    await service.placeOrder({ quote_id: q.quote_id, idempotency_key: "first-key-001", customer, confirm: true });
    await expectCode(
      service.placeOrder({ quote_id: q.quote_id, idempotency_key: "second-key-01", customer, confirm: true }),
      "QUOTE_ALREADY_USED",
    );
  });
});

describe("sold-out items", () => {
  it("refuses to quote a sold-out item", async () => {
    const { service } = setup();
    const err = await expectCode(
      service.quoteOrder({
        location_id: "crumb-hydrostone",
        lines: [{ item_id: "crumb-morning-bun", quantity: 1, modifiers: [] }],
        fulfillment: "pickup",
      }),
      "ITEM_SOLD_OUT",
    );
    expect(err.suggestedNextTool).toBe("search_menu");
  });

  it("refuses more than the tracked quantity", async () => {
    const { service } = setup();
    const err = await expectCode(
      service.quoteOrder({
        location_id: "crumb-quinpool",
        lines: [{ item_id: "crumb-morning-bun", quantity: 5, modifiers: [] }],
        fulfillment: "pickup",
      }),
      "ITEM_SOLD_OUT",
    );
    expect(err.details?.problems).toEqual([expect.objectContaining({ available_quantity: 3 })]);
  });

  it("catches an item that sells out between quote and order", async () => {
    const { service, adapter } = setup();
    const q = await service.quoteOrder({ location_id: "northline-barrington", lines: lunch, fulfillment: "pickup" });
    adapter.setStock("northline-barrington", "nl-turkey-club", "sold_out", 0);
    await expectCode(
      service.placeOrder({ quote_id: q.quote_id, idempotency_key: "soldout-key-1", customer, confirm: true }),
      "ITEM_SOLD_OUT",
    );
  });

  it("catches a price change between quote and order", async () => {
    const { service, adapter } = setup();
    const q = await service.quoteOrder({ location_id: "northline-barrington", lines: lunch, fulfillment: "pickup" });
    adapter.setPrice("nl-turkey-club", 1395);
    const err = await expectCode(
      service.placeOrder({ quote_id: q.quote_id, idempotency_key: "price-key-001", customer, confirm: true }),
      "PRICE_CHANGED",
    );
    expect(err.suggestedNextTool).toBe("quote_order");
  });

  it("search_menu hides sold-out items unless asked", async () => {
    const { service } = setup();
    const visible = await service.searchMenu({ location_id: "crumb-hydrostone", query: "morning bun" });
    expect(visible.items).toHaveLength(0);
    const all = await service.searchMenu({ location_id: "crumb-hydrostone", query: "morning bun", include_unavailable: true });
    expect(all.items[0]!.availability.status).toBe("sold_out");
  });
});

describe("policy", () => {
  it("flags the quote and blocks place_order over the per-order cap", async () => {
    const { service } = setup({ policy: { max_order_total: 30 } });
    const q = await service.quoteOrder({ location_id: "northline-barrington", lines: lunch, fulfillment: "pickup" });
    expect(q.policy.allowed).toBe(false);
    expect(q.policy.violations[0]!.code).toBe("ORDER_TOTAL_CAP");
    const err = await expectCode(
      service.placeOrder({ quote_id: q.quote_id, idempotency_key: "policy-key-01", customer, confirm: true }),
      "POLICY_BLOCKED",
    );
    expect(err.details?.violations).toEqual([expect.objectContaining({ code: "ORDER_TOTAL_CAP", limit: 3000 })]);
  });

  it("enforces the daily cap across orders", async () => {
    const { service } = setup({ policy: { max_daily_total: 60 } });
    const q1 = await service.quoteOrder({ location_id: "northline-barrington", lines: lunch, fulfillment: "pickup" });
    await service.placeOrder({ quote_id: q1.quote_id, idempotency_key: "daily-key-001", customer, confirm: true });
    const q2 = await service.quoteOrder({ location_id: "northline-barrington", lines: lunch, fulfillment: "pickup" });
    expect(q2.policy.violations.map((v) => v.code)).toContain("DAILY_TOTAL_CAP");
    await expectCode(
      service.placeOrder({ quote_id: q2.quote_id, idempotency_key: "daily-key-002", customer, confirm: true }),
      "POLICY_BLOCKED",
    );
  });

  it("restricts locations and headcount", async () => {
    const { service } = setup({ policy: { allowed_location_ids: ["crumb-quinpool"], max_headcount: 20 } });
    const q = await service.quoteOrder({ location_id: "northline-barrington", lines: lunch, fulfillment: "pickup", headcount: 25 });
    expect(q.policy.violations.map((v) => v.code).sort()).toEqual(["HEADCOUNT_CAP", "LOCATION_NOT_ALLOWED"]);
    await expectCode(
      service.planGroupOrder({ location_id: "crumb-quinpool", headcount: 30, budget_per_person: 2000, desired_time: WED_NOON }),
      "POLICY_BLOCKED",
    );
  });
});

describe("hours, zones, lead times, modifiers", () => {
  it("CLOSED with the next opening time", async () => {
    const { service } = setup();
    // Monday: Crumb & Co Quinpool is closed.
    const err = await expectCode(
      service.quoteOrder({
        location_id: "crumb-quinpool",
        lines: [{ item_id: "crumb-butter-croissant", quantity: 1, modifiers: [] }],
        fulfillment: "pickup",
        desired_time: "2026-10-12T15:00:00Z",
      }),
      "CLOSED",
    );
    expect(err.details?.next_open_at).toBe("2026-10-13T10:00:00.000Z");
  });

  it("OUTSIDE_DELIVERY_ZONE for a postal code the cafe does not serve", async () => {
    const { service } = setup();
    await expectCode(
      service.quoteOrder({
        location_id: "northline-barrington",
        lines: lunch,
        fulfillment: "delivery",
        desired_time: WED_NOON,
        delivery_address: { ...officeAddress, line1: "100 Main St", city: "Dartmouth", postal_code: "B2W 4K2" },
      }),
      "OUTSIDE_DELIVERY_ZONE",
    );
  });

  it("radius zones use coordinates", async () => {
    const { service } = setup();
    const lines = [{ item_id: "crumb-ham-gruyere", quantity: 3, modifiers: [] }];
    const ok = await service.quoteOrder({ location_id: "crumb-quinpool", lines, fulfillment: "delivery", desired_time: WED_NOON, delivery_address: officeAddress });
    expect(ok.fees[0]!.code).toBe("delivery");
    await expectCode(
      service.quoteOrder({
        location_id: "crumb-quinpool",
        lines,
        fulfillment: "delivery",
        desired_time: WED_NOON,
        delivery_address: { ...officeAddress, lat: 44.75, lng: -63.7 },
      }),
      "OUTSIDE_DELIVERY_ZONE",
    );
  });

  it("LEAD_TIME_NOT_MET for a cake needed tomorrow, with earliest time", async () => {
    const { service } = setup();
    const err = await expectCode(
      service.quoteOrder({
        location_id: "crumb-quinpool",
        lines: [{ item_id: "crumb-chocolate-cake", quantity: 1, modifiers: [] }],
        fulfillment: "pickup",
        desired_time: "2026-10-08T15:00:00Z",
      }),
      "LEAD_TIME_NOT_MET",
    );
    expect(err.details?.problems).toEqual([expect.objectContaining({ earliest_time: "2026-10-09T13:00:00.000Z" })]);
    const ok = await service.quoteOrder({
      location_id: "crumb-quinpool",
      lines: [{ item_id: "crumb-chocolate-cake", quantity: 1, modifiers: [{ group_id: "inscription", option_id: "happy-birthday" }] }],
      fulfillment: "pickup",
      desired_time: "2026-10-09T18:00:00Z",
    });
    expect(ok.total.amount).toBeGreaterThan(5800);
  });

  it("INVALID_MODIFIERS lists what is missing", async () => {
    const { service } = setup();
    const err = await expectCode(
      service.quoteOrder({
        location_id: "northline-barrington",
        lines: [{ item_id: "nl-latte", quantity: 1, modifiers: [{ group_id: "size", option_id: "venti" }] }],
        fulfillment: "pickup",
      }),
      "INVALID_MODIFIERS",
    );
    expect(err.message).toMatch(/venti/);
    expect(err.message).toMatch(/Milk/);
  });

  it("delivery minimum", async () => {
    const { service } = setup();
    await expectCode(
      service.quoteOrder({
        location_id: "northline-barrington",
        lines: [{ item_id: "nl-oat-cookie", quantity: 1, modifiers: [] }],
        fulfillment: "delivery",
        desired_time: WED_NOON,
        delivery_address: officeAddress,
      }),
      "MINIMUM_NOT_MET",
    );
  });
});

describe("cancellation", () => {
  it("cancels inside the window and refuses after", async () => {
    const { service, advance } = setup({ config: { dry_run: false } });
    const q1 = await service.quoteOrder({ location_id: "northline-barrington", lines: lunch, fulfillment: "pickup" });
    const { order } = await service.placeOrder({ quote_id: q1.quote_id, idempotency_key: "cancel-key-01", customer, confirm: true });
    const res = await service.cancelOrder(order.order_id, "Meeting moved");
    expect(res.cancelled).toBe(true);
    expect((await service.getOrderStatus(order.order_id)).status).toBe("cancelled");

    const q2 = await service.quoteOrder({ location_id: "northline-barrington", lines: lunch, fulfillment: "pickup" });
    const { order: o2 } = await service.placeOrder({ quote_id: q2.quote_id, idempotency_key: "cancel-key-02", customer, confirm: true });
    advance(30); // order is ready
    await expectCode(service.cancelOrder(o2.order_id, "too late"), "CANCELLATION_WINDOW_CLOSED");
  });
});

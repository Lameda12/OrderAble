import { randomBytes } from "node:crypto";
import type { Adapter, StockLevel } from "./adapters/types.js";
import type { OrderableConfig } from "./config.js";
import { OrderableError } from "./errors.js";
import { evaluatePolicy, spentOnDay } from "./policy.js";
import { defaultModifiers, formatMoney, money } from "./pricing.js";
import type {
  Address,
  Allergen,
  Availability,
  CustomerContact,
  DietaryTag,
  FulfillmentMode,
  Item,
  Location,
  Order,
  OrderLineInput,
  Payment,
  PaymentMethod,
  PricedLine,
  Quote,
  SelectedModifier,
} from "./schema.js";
import type { Store } from "./store.js";
import { addMinutes, haversineKm, hoursToday, isOpenAt, iso, localParts, nextOpenAt } from "./time.js";

const id = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;
const normPostal = (p: string) => p.replace(/\s+/g, "").toUpperCase();

/** vegan food is also vegetarian and dairy-free. */
export function hasDietaryTag(item: Pick<Item, "dietary_tags">, tag: DietaryTag) {
  const tags = new Set(item.dietary_tags);
  if (tags.has(tag)) return true;
  if (tags.has("vegan") && (tag === "vegetarian" || tag === "dairy_free")) return true;
  return false;
}

export function allergenLists(item: Pick<Item, "allergens">) {
  const entries = Object.entries(item.allergens) as [Allergen, string][];
  return {
    contains: entries.filter(([, s]) => s === "contains").map(([a]) => a),
    may_contain: entries.filter(([, s]) => s === "may_contain").map(([a]) => a),
    unknown: entries.filter(([, s]) => s === "unknown").map(([a]) => a),
  };
}

export interface ServiceOptions {
  adapter: Adapter;
  store: Store;
  config: OrderableConfig;
  now?: () => Date;
}

export interface QuoteInput {
  location_id: string;
  lines: OrderLineInput[];
  fulfillment: FulfillmentMode;
  desired_time?: string | undefined;
  delivery_address?: Address | undefined;
  headcount?: number | undefined;
}

/**
 * The ordering engine. Tools are thin wrappers over these methods; this is where hours,
 * lead times, delivery zones, stock, policy, quotes and idempotency are enforced.
 */
export class OrderableService {
  readonly adapter: Adapter;
  readonly store: Store;
  readonly config: OrderableConfig;
  readonly now: () => Date;

  constructor(opts: ServiceOptions) {
    this.adapter = opts.adapter;
    this.store = opts.store;
    this.config = opts.config;
    this.now = opts.now ?? (() => new Date());
  }

  // ---------------------------------------------------------------- locations

  async location(locationId: string): Promise<Location> {
    const loc = (await this.adapter.listLocations()).find((l) => l.id === locationId);
    if (!loc) throw new OrderableError("LOCATION_NOT_FOUND", `No location "${locationId}"`, "list_locations");
    return loc;
  }

  deliveryCoverage(loc: Location, where: { lat?: number | undefined; lng?: number | undefined; postal_code?: string | undefined }) {
    if (!loc.fulfillment_modes.includes("delivery") || !loc.delivery_zone) return "no" as const;
    const z = loc.delivery_zone;
    if (z.type === "postal_codes") {
      if (!where.postal_code) return "unknown" as const;
      const pc = normPostal(where.postal_code);
      return z.prefixes.some((p) => pc.startsWith(normPostal(p))) ? ("yes" as const) : ("no" as const);
    }
    if (where.lat == null || where.lng == null || loc.address.lat == null || loc.address.lng == null) return "unknown" as const;
    return haversineKm({ lat: loc.address.lat, lng: loc.address.lng }, { lat: where.lat, lng: where.lng }) <= z.radius_km
      ? ("yes" as const)
      : ("no" as const);
  }

  async listLocations(input: {
    near?: { lat: number; lng: number } | undefined;
    postal_code?: string | undefined;
    fulfillment?: FulfillmentMode | undefined;
  }) {
    const now = this.now();
    const where = { lat: input.near?.lat, lng: input.near?.lng, postal_code: input.postal_code };
    const located = !!(input.near || input.postal_code);
    const rows = (await this.adapter.listLocations())
      .filter((l) => !input.fulfillment || l.fulfillment_modes.includes(input.fulfillment))
      .map((l) => {
        const coverage = this.deliveryCoverage(l, where);
        const distance =
          input.near && l.address.lat != null && l.address.lng != null
            ? Math.round(haversineKm(input.near, { lat: l.address.lat, lng: l.address.lng }) * 10) / 10
            : null;
        const open = isOpenAt(l, now);
        return {
          ...l,
          open_now: open,
          hours_today: hoursToday(l, now),
          next_open_at: open ? null : (nextOpenAt(l, now)?.toISOString() ?? null),
          distance_km: distance,
          delivers_to_you: located ? coverage : null,
        };
      })
      .filter((l) => !(input.fulfillment === "delivery" && l.delivers_to_you === "no"))
      .sort((a, b) => {
        const rank = (c: string | null) => (c === "yes" ? 0 : c === "unknown" ? 1 : 2);
        return (
          (input.fulfillment === "delivery" ? rank(a.delivers_to_you) - rank(b.delivers_to_you) : 0) ||
          (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity) ||
          a.name.localeCompare(b.name)
        );
      });
    return {
      locations: rows,
      as_of: iso(now),
      ttl_seconds: 300,
      next_step: rows.length
        ? "Call search_menu with a location_id to see what this location sells right now."
        : "No location matches. Try without the fulfillment filter or with a different area.",
    };
  }

  // ---------------------------------------------------------------- menu

  /** Stock + hours + lead time → whether an item can be ordered for a time. */
  private availabilityFor(
    loc: Location,
    item: Item,
    stock: StockLevel,
    desired: Date | null,
    fulfillment?: FulfillmentMode,
    quantity = 1,
  ): Availability {
    const now = this.now();
    const stale = new Date(stock.as_of).getTime() + stock.ttl_seconds * 1000 < now.getTime();
    const minReady = addMinutes(now, Math.max(item.lead_time_minutes, loc.prep_minutes));
    const earliest = stock.status === "sold_out" ? null : nextOpenAt(loc, minReady);
    const reasons: string[] = [];
    let orderable = stock.status !== "sold_out";

    if (stock.status === "sold_out") reasons.push("Sold out");
    if (stock.quantity != null && stock.quantity < quantity && stock.status !== "sold_out") {
      orderable = false;
      reasons.push(`Only ${stock.quantity} left`);
    }
    const modes = item.fulfillment_modes ?? loc.fulfillment_modes;
    if (fulfillment && (!modes.includes(fulfillment) || !loc.fulfillment_modes.includes(fulfillment))) {
      orderable = false;
      reasons.push(`Not available for ${fulfillment}`);
    }
    if (desired) {
      const ready = fulfillment === "delivery" ? addMinutes(desired, -loc.delivery_minutes) : desired;
      if (addMinutes(now, item.lead_time_minutes) > ready) {
        orderable = false;
        reasons.push(`Needs ${item.lead_time_minutes} min notice`);
      }
      if (!isOpenAt(loc, ready)) {
        orderable = false;
        reasons.push("Location closed at that time");
      }
    }
    if (stock.status === "unknown") reasons.push("Stock not tracked: merchant confirms on order");
    if (stale) reasons.push(`Stock data is stale (as of ${stock.as_of})`);

    return {
      item_id: item.id,
      location_id: loc.id,
      status: stock.status,
      quantity: stock.quantity,
      orderable,
      earliest_time: earliest ? iso(earliest) : null,
      ...(reasons.length ? { reason: reasons.join("; ") } : {}),
      stale,
      as_of: stock.as_of,
      ttl_seconds: stock.ttl_seconds,
    };
  }

  async menuWithAvailability(locationId: string, desired: Date | null = null, fulfillment?: FulfillmentMode) {
    const loc = await this.location(locationId);
    const menu = await this.adapter.getMenu(locationId);
    const stock = await this.adapter.getAvailability(
      locationId,
      menu.items.map((i) => i.id),
    );
    const items = menu.items.map((item) => ({
      item,
      availability: this.availabilityFor(loc, item, stock.find((s) => s.item_id === item.id)!, desired, fulfillment),
    }));
    return { loc, menu, items };
  }

  async searchMenu(input: {
    location_id: string;
    query?: string | undefined;
    dietary?: DietaryTag[] | undefined;
    exclude_allergens?: Allergen[] | undefined;
    max_price?: number | undefined;
    category?: string | undefined;
    fulfillment?: FulfillmentMode | undefined;
    desired_time?: string | undefined;
    include_unavailable?: boolean | undefined;
    limit?: number | undefined;
  }) {
    const desired = input.desired_time ? new Date(input.desired_time) : null;
    const { loc, menu, items } = await this.menuWithAvailability(input.location_id, desired, input.fulfillment);
    const catName = (id: string) => menu.categories.find((c) => c.id === id)?.name ?? id;
    const tokens = (input.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const cat = input.category?.toLowerCase();

    const matches = items.filter(({ item, availability }) => {
      if (!input.include_unavailable && !availability.orderable) return false;
      if (cat && item.category_id.toLowerCase() !== cat && catName(item.category_id).toLowerCase() !== cat) return false;
      if (input.max_price != null && item.price.amount > input.max_price) return false;
      if (input.dietary?.some((t) => !hasDietaryTag(item, t))) return false;
      if (input.exclude_allergens?.some((a) => item.allergens[a] === "contains" || item.allergens[a] === "may_contain"))
        return false;
      const hay = `${item.name} ${item.description} ${catName(item.category_id)} ${item.dietary_tags.join(" ")}`.toLowerCase();
      return tokens.every((t) => hay.includes(t) || hay.includes(t.replace(/s$/, "")));
    });

    const limit = input.limit ?? 25;
    return {
      location_id: loc.id,
      location_name: loc.name,
      total_matches: matches.length,
      items: matches.slice(0, limit).map(({ item, availability }) => {
        const a = allergenLists(item);
        const unverified = (input.exclude_allergens ?? []).filter((x) => item.allergens[x] === "unknown");
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          category: catName(item.category_id),
          price: item.price,
          price_display: formatMoney(item.price),
          role: item.role,
          serves: item.serves,
          lead_time_minutes: item.lead_time_minutes,
          dietary_tags: item.dietary_tags,
          allergens_contains: a.contains,
          allergens_may_contain: a.may_contain,
          allergens_unknown: a.unknown,
          ...(unverified.length
            ? { allergen_warning: `Merchant has not stated whether this contains: ${unverified.join(", ")}. Treat as unsafe for severe allergies.` }
            : {}),
          modifier_groups: item.modifier_groups,
          availability,
        };
      }),
      as_of: menu.as_of,
      ttl_seconds: menu.ttl_seconds,
      next_step:
        "Call get_item for full allergen detail, check_availability for a specific time, or quote_order with chosen items (include required modifiers).",
    };
  }

  async getItem(itemId: string) {
    const item = await this.adapter.getItem(itemId);
    if (!item) throw new OrderableError("ITEM_NOT_FOUND", `No item "${itemId}"`, "search_menu");
    const locations = (await this.adapter.listLocations()).filter(
      (l) => l.business_id === item.business_id && (!item.location_ids || item.location_ids.includes(l.id)),
    );
    const availability = await Promise.all(
      locations.map(async (loc) => {
        const [stock] = await this.adapter.getAvailability(loc.id, [item.id]);
        return this.availabilityFor(loc, item, stock!, null);
      }),
    );
    const a = allergenLists(item);
    const now = this.now();
    return {
      item,
      price_display: formatMoney(item.price),
      allergen_summary:
        a.unknown.length === 0
          ? "Merchant has stated status for every major allergen."
          : `Contains: ${a.contains.join(", ") || "none stated"}. May contain: ${a.may_contain.join(", ") || "none stated"}. Unknown (treat as possibly present): ${a.unknown.join(", ")}.`,
      required_modifier_groups: item.modifier_groups.filter((g) => g.min > 0).map((g) => g.id),
      availability,
      as_of: availability[0]?.as_of ?? iso(now),
      ttl_seconds: availability[0]?.ttl_seconds ?? 300,
      next_step: "Call quote_order with this item_id, a quantity, and one option per required modifier group.",
    };
  }

  async checkAvailability(input: {
    location_id: string;
    item_ids: string[];
    desired_time?: string | undefined;
    fulfillment?: FulfillmentMode | undefined;
    quantities?: Record<string, number> | undefined;
  }) {
    const loc = await this.location(input.location_id);
    const desired = input.desired_time ? new Date(input.desired_time) : null;
    const stock = await this.adapter.getAvailability(loc.id, input.item_ids);
    const results = await Promise.all(
      input.item_ids.map(async (itemId, i) => {
        const item = await this.adapter.getItem(itemId);
        if (!item)
          return {
            item_id: itemId,
            location_id: loc.id,
            status: "unknown" as const,
            quantity: null,
            orderable: false,
            earliest_time: null,
            reason: "No such item",
            stale: false,
            as_of: iso(this.now()),
            ttl_seconds: 0,
          };
        return this.availabilityFor(loc, item, stock[i]!, desired, input.fulfillment, input.quantities?.[itemId] ?? 1);
      }),
    );
    const now = this.now();
    const ready = desired && input.fulfillment === "delivery" ? addMinutes(desired, -loc.delivery_minutes) : desired;
    return {
      location_id: loc.id,
      desired_time: desired ? iso(desired) : null,
      open_at_desired_time: ready ? isOpenAt(loc, ready) : isOpenAt(loc, now),
      all_orderable: results.every((r) => r.orderable),
      availability: results,
      as_of: results.map((r) => r.as_of).sort()[0] ?? iso(now),
      ttl_seconds: Math.min(...results.map((r) => r.ttl_seconds), 300),
      next_step: results.every((r) => r.orderable)
        ? "Everything is orderable. Call quote_order."
        : "Some items are not orderable at that time. Use earliest_time, pick substitutes via search_menu, or change desired_time.",
    };
  }

  // ---------------------------------------------------------------- quoting

  /** Resolve times, enforce hours/zone/fulfillment. Shared by quote_order and plan_group_order. */
  private resolveTiming(loc: Location, fulfillment: FulfillmentMode, desiredTime?: string) {
    const now = this.now();
    if (!loc.fulfillment_modes.includes(fulfillment))
      throw new OrderableError(
        "FULFILLMENT_UNAVAILABLE",
        `${loc.name} does not offer ${fulfillment}. It offers: ${loc.fulfillment_modes.join(", ")}`,
        "list_locations",
        { offered: loc.fulfillment_modes },
      );
    const travel = fulfillment === "delivery" ? loc.delivery_minutes : 0;
    let eta: Date;
    if (desiredTime) {
      eta = new Date(desiredTime);
      if (Number.isNaN(eta.getTime())) throw new OrderableError("INVALID_REQUEST", "desired_time is not a valid ISO 8601 time");
      if (eta.getTime() < now.getTime() + (loc.prep_minutes + travel) * 60_000 - 60_000)
        throw new OrderableError(
          "LEAD_TIME_NOT_MET",
          `${loc.name} needs at least ${loc.prep_minutes + travel} min. Earliest: ${iso(addMinutes(now, loc.prep_minutes + travel))}`,
          "quote_order",
          { earliest_time: iso(addMinutes(now, loc.prep_minutes + travel)) },
        );
    } else {
      eta = addMinutes(now, loc.prep_minutes + travel);
    }
    const ready = addMinutes(eta, -travel);
    if (!isOpenAt(loc, ready)) {
      const next = nextOpenAt(loc, ready);
      throw new OrderableError(
        "CLOSED",
        `${loc.name} is closed at ${ready.toLocaleString("en-CA", { timeZone: loc.timezone })} local time. Hours today: ${hoursToday(loc, ready)}.`,
        "quote_order",
        {
          next_open_at: next ? iso(next) : null,
          suggested_desired_time: next ? iso(addMinutes(next, loc.prep_minutes + travel)) : null,
        },
      );
    }
    return { eta, ready };
  }

  private checkZone(loc: Location, fulfillment: FulfillmentMode, address?: Address) {
    if (fulfillment !== "delivery") return;
    if (!address)
      throw new OrderableError("INVALID_REQUEST", "delivery_address is required for delivery", "quote_order");
    const coverage = this.deliveryCoverage(loc, address);
    if (coverage === "yes") return;
    if (coverage === "unknown")
      throw new OrderableError(
        "INVALID_REQUEST",
        `${loc.name} delivers within a radius. Include lat and lng in delivery_address so the zone can be checked.`,
        "quote_order",
      );
    throw new OrderableError(
      "OUTSIDE_DELIVERY_ZONE",
      `${address.line1}, ${address.postal_code} is outside ${loc.name}'s delivery zone`,
      "list_locations",
      { delivery_zone: loc.delivery_zone, alternatives: "Try pickup, or list_locations with fulfillment=delivery and your postal_code" },
    );
  }

  /** Price the cart and verify every line is in stock, offered for this mode, and meets lead time. */
  private async priceAndCheck(loc: Location, input: QuoteInput, ready: Date, leadTimeFrom: Date) {
    if (!input.lines.length) throw new OrderableError("INVALID_REQUEST", "lines must not be empty", "search_menu");
    const priced = await this.adapter.quote({
      location: loc,
      lines: input.lines,
      fulfillment: input.fulfillment,
      ...(input.delivery_address ? { delivery_address: input.delivery_address } : {}),
    });

    const qtyByItem = new Map<string, number>();
    for (const l of input.lines) qtyByItem.set(l.item_id, (qtyByItem.get(l.item_id) ?? 0) + l.quantity);
    const ids = [...qtyByItem.keys()];
    const stock = await this.adapter.getAvailability(loc.id, ids);
    const now = this.now();

    const problems: { code: "ITEM_SOLD_OUT" | "ITEM_UNAVAILABLE" | "LEAD_TIME_NOT_MET"; item_id: string; message: string; earliest_time?: string | null; available_quantity?: number | null }[] = [];
    const warnings: string[] = [];

    for (const [itemId, qty] of qtyByItem) {
      const item = (await this.adapter.getItem(itemId))!;
      const s = stock.find((x) => x.item_id === itemId)!;
      const modes = item.fulfillment_modes ?? loc.fulfillment_modes;
      if (!modes.includes(input.fulfillment))
        problems.push({ code: "ITEM_UNAVAILABLE", item_id: itemId, message: `${item.name} is only available for ${modes.join(", ")}` });
      if (s.status === "sold_out")
        problems.push({ code: "ITEM_SOLD_OUT", item_id: itemId, message: `${item.name} is sold out`, available_quantity: 0 });
      else if (s.quantity != null && s.quantity < qty)
        problems.push({
          code: "ITEM_SOLD_OUT",
          item_id: itemId,
          message: `Only ${s.quantity} ${item.name} left, ${qty} requested`,
          available_quantity: s.quantity,
        });
      if (addMinutes(leadTimeFrom, item.lead_time_minutes) > ready) {
        const earliest = nextOpenAt(loc, addMinutes(now, Math.max(item.lead_time_minutes, loc.prep_minutes)));
        problems.push({
          code: "LEAD_TIME_NOT_MET",
          item_id: itemId,
          message: `${item.name} needs ${item.lead_time_minutes / 60}h notice. Earliest: ${earliest ? iso(earliest) : "unknown"}`,
          earliest_time: earliest ? iso(earliest) : null,
        });
      }
      if (s.status === "low") warnings.push(`${item.name} is running low${s.quantity != null ? ` (${s.quantity} left)` : ""}.`);
      if (s.status === "unknown") warnings.push(`${item.name}: stock not tracked. The merchant will confirm.`);
      if (new Date(s.as_of).getTime() + s.ttl_seconds * 1000 < now.getTime())
        warnings.push(`${item.name}: stock data is stale (as of ${s.as_of}).`);
    }

    if (problems.length) {
      const first = problems[0]!;
      throw new OrderableError(
        first.code,
        problems.map((p) => p.message).join("; "),
        first.code === "LEAD_TIME_NOT_MET" ? "check_availability" : "search_menu",
        { problems },
      );
    }

    if (input.fulfillment === "delivery" && loc.min_delivery_subtotal && priced.subtotal.amount < loc.min_delivery_subtotal.amount)
      throw new OrderableError(
        "MINIMUM_NOT_MET",
        `Delivery minimum is ${formatMoney(loc.min_delivery_subtotal)}, cart subtotal is ${formatMoney(priced.subtotal)}`,
        "search_menu",
        { minimum: loc.min_delivery_subtotal, subtotal: priced.subtotal },
      );

    return { priced, warnings };
  }

  private async spentToday() {
    const now = this.now();
    return spentOnDay(await this.store.ordersCreatedAfter(iso(addMinutes(now, -48 * 60))), now, this.config.policy.timezone);
  }

  async quoteOrder(input: QuoteInput): Promise<Quote & { next_step: string }> {
    const now = this.now();
    const loc = await this.location(input.location_id);
    const { eta, ready } = this.resolveTiming(loc, input.fulfillment, input.desired_time);
    this.checkZone(loc, input.fulfillment, input.delivery_address);
    const { priced, warnings } = await this.priceAndCheck(loc, input, ready, now);

    const policy = evaluatePolicy(this.config.policy, {
      location_id: loc.id,
      total_minor: priced.total.amount,
      headcount: input.headcount,
      spent_today_minor: await this.spentToday(),
    });
    if (this.config.dry_run) warnings.push("DRY_RUN is on: orders will be recorded but not sent to the merchant.");

    const quote: Quote = {
      quote_id: id("q"),
      location_id: loc.id,
      fulfillment: input.fulfillment,
      desired_time: iso(eta),
      eta: iso(eta),
      ...(input.delivery_address ? { delivery_address: input.delivery_address } : {}),
      ...(input.headcount ? { headcount: input.headcount } : {}),
      lines: priced.lines,
      subtotal: priced.subtotal,
      fees: priced.fees,
      tax: priced.tax,
      total: priced.total,
      expires_at: iso(new Date(now.getTime() + this.config.quote_ttl_seconds * 1000)),
      policy,
      warnings,
      as_of: iso(now),
      ttl_seconds: this.config.quote_ttl_seconds,
    };
    await this.store.saveQuote(quote);
    return {
      ...quote,
      next_step: policy.allowed
        ? `Show the customer the total (${formatMoney(quote.total)}), then call place_order with quote_id, a fresh idempotency_key, contact details and confirm: true before ${quote.expires_at}.`
        : `Policy blocks this order: ${policy.violations.map((v) => v.message).join("; ")}. Reduce the order or ask a human.`,
    };
  }

  // ---------------------------------------------------------------- ordering

  private payment(method: PaymentMethod, orderId: string, total: Quote["total"], fulfillment: FulfillmentMode): Payment {
    if (method === "payment_link") {
      const tpl = this.config.payment.payment_link_template;
      if (!tpl) throw new OrderableError("INVALID_REQUEST", "payment_link is not configured for this merchant");
      return {
        method,
        url: tpl.replace("{order_id}", encodeURIComponent(orderId)).replace("{total}", String(total.amount)),
        instructions: `Pay ${formatMoney(total)} on the merchant's secure page. Card details never pass through the agent.`,
      };
    }
    if (method === "invoice")
      return {
        method,
        instructions: `Billed to the customer's account, ${this.config.payment.invoice_terms}. An invoice for ${formatMoney(total)} is emailed after fulfillment.`,
      };
    return {
      method,
      instructions:
        fulfillment === "delivery"
          ? `Pay ${formatMoney(total)} to the courier at handoff (card or tap).`
          : `Pay ${formatMoney(total)} at the counter on pickup.`,
    };
  }

  async placeOrder(input: {
    quote_id: string;
    idempotency_key: string;
    customer: CustomerContact;
    confirm: true;
    payment_method?: PaymentMethod | undefined;
  }) {
    const replay = await this.store.findOrderByIdempotencyKey(input.idempotency_key);
    if (replay) {
      if (replay.order.quote_id !== input.quote_id)
        throw new OrderableError(
          "IDEMPOTENCY_KEY_REUSED",
          "This idempotency_key was already used for a different quote. Use a new key for a new order.",
          "place_order",
          { existing_order_id: replay.order.order_id },
        );
      return { order: replay.order, idempotent_replay: true, next_step: "This is the original order (safe retry). Call get_order_status to track it." };
    }

    if (input.confirm !== true)
      throw new OrderableError("INVALID_REQUEST", "confirm must be true. Get the customer's explicit go-ahead first.");

    const stored = await this.store.getQuote(input.quote_id);
    if (!stored) throw new OrderableError("QUOTE_NOT_FOUND", `No quote "${input.quote_id}"`, "quote_order");
    const { quote } = stored;
    if (stored.used_by_order_id)
      throw new OrderableError("QUOTE_ALREADY_USED", "This quote was already turned into an order", "get_order_status", {
        order_id: stored.used_by_order_id,
      });
    const now = this.now();
    if (now > new Date(quote.expires_at))
      throw new OrderableError("QUOTE_EXPIRED", `Quote expired at ${quote.expires_at}. Request a fresh quote.`, "quote_order", {
        expired_at: quote.expires_at,
      });

    // Re-verify against live data: stock and prices can move inside the quote window.
    const loc = await this.location(quote.location_id);
    const travel = quote.fulfillment === "delivery" ? loc.delivery_minutes : 0;
    const linesInput: OrderLineInput[] = quote.lines.map((l) => ({
      item_id: l.item_id,
      quantity: l.quantity,
      modifiers: l.modifiers.map((m) => ({ group_id: m.group_id, option_id: m.option_id })),
      ...(l.notes ? { notes: l.notes } : {}),
    }));
    const { priced } = await this.priceAndCheck(
      loc,
      {
        location_id: loc.id,
        lines: linesInput,
        fulfillment: quote.fulfillment,
        ...(quote.delivery_address ? { delivery_address: quote.delivery_address } : {}),
      },
      addMinutes(new Date(quote.eta), -travel),
      new Date(quote.as_of), // lead time was satisfied when quoted; the slot is held
    );
    if (priced.total.amount !== quote.total.amount)
      throw new OrderableError(
        "PRICE_CHANGED",
        `Prices changed since the quote: total was ${formatMoney(quote.total)}, now ${formatMoney(priced.total)}`,
        "quote_order",
        { quoted_total: quote.total, current_total: priced.total },
      );

    const policy = evaluatePolicy(this.config.policy, {
      location_id: loc.id,
      total_minor: quote.total.amount,
      headcount: quote.headcount,
      spent_today_minor: await this.spentToday(),
    });
    if (!policy.allowed)
      throw new OrderableError("POLICY_BLOCKED", policy.violations.map((v) => v.message).join("; "), null, {
        violations: policy.violations,
      });

    const method = input.payment_method ?? this.config.payment.methods[0]!;
    if (!this.config.payment.methods.includes(method))
      throw new OrderableError(
        "INVALID_REQUEST",
        `Payment method ${method} is not accepted. Accepted: ${this.config.payment.methods.join(", ")}`,
        "place_order",
      );

    const businesses = await this.adapter.listBusinesses();
    const cancellation = businesses.find((b) => b.id === loc.business_id)?.policies.cancellation;
    const orderId = id("ord");
    const cancellableUntil = cancellation
      ? new Date(
          Math.max(
            addMinutes(now, cancellation.free_within_minutes).getTime(),
            addMinutes(new Date(quote.eta), -cancellation.until_minutes_before_ready).getTime(),
          ),
        )
      : null;

    const order: Order = {
      order_id: orderId,
      quote_id: quote.quote_id,
      location_id: loc.id,
      status: "received",
      fulfillment: quote.fulfillment,
      eta: quote.eta,
      lines: quote.lines,
      subtotal: quote.subtotal,
      fees: quote.fees,
      tax: quote.tax,
      total: quote.total,
      customer: Object.fromEntries(Object.entries(input.customer).filter(([, v]) => v !== undefined)) as Order["customer"],
      ...(quote.delivery_address ? { delivery_address: quote.delivery_address } : {}),
      payment: this.payment(method, orderId, quote.total, quote.fulfillment),
      dry_run: this.config.dry_run,
      created_at: iso(now),
      cancellable_until: cancellableUntil ? iso(cancellableUntil) : null,
      timeline: [
        {
          status: "received",
          at: iso(now),
          ...(this.config.dry_run ? { note: "DRY_RUN: recorded only, not sent to the merchant" } : {}),
        },
      ],
    };

    if (!await this.store.reserveOrder(order, input.idempotency_key)) {
      // Lost a race: another call claimed this key or quote first.
      const winner = await this.store.findOrderByIdempotencyKey(input.idempotency_key);
      if (winner && winner.order.quote_id === input.quote_id)
        return { order: winner.order, idempotent_replay: true, next_step: "Call get_order_status to track it." };
      throw new OrderableError("QUOTE_ALREADY_USED", "This quote was already turned into an order", "get_order_status");
    }

    if (!this.config.dry_run) {
      try {
        const result = await this.adapter.placeOrder({ order_id: orderId, quote, customer: input.customer, payment: order.payment });
        if (result.payment_url) order.payment = { ...order.payment, url: result.payment_url };
        order.status = result.status;
        await this.store.updateOrder(order, result.external_id);
      } catch (e) {
        await this.store.releaseOrder(orderId);
        throw new OrderableError(
          "ADAPTER_ERROR",
          `The merchant's system rejected the order: ${e instanceof Error ? e.message : String(e)}`,
          "quote_order",
        );
      }
    }

    return {
      order,
      idempotent_replay: false,
      next_step: `Order ${orderId} is ${this.config.dry_run ? "recorded (DRY_RUN, not sent to the merchant)" : "with the merchant"}. Tell the customer: ${order.payment.instructions} Track with get_order_status.`,
    };
  }

  async getOrderStatus(orderId: string) {
    const stored = await this.store.getOrder(orderId);
    if (!stored) throw new OrderableError("ORDER_NOT_FOUND", `No order "${orderId}"`, null);
    let order = stored.order;
    if (!order.dry_run && stored.external_id && order.status !== "cancelled") {
      const live = await this.adapter.getOrderStatus(stored.external_id, order);
      order = { ...order, status: live.status, timeline: live.timeline };
      await this.store.updateOrder(order);
    }
    const terminal = ["delivered", "picked_up", "cancelled"].includes(order.status);
    return {
      order_id: order.order_id,
      status: order.status,
      eta: order.eta,
      dry_run: order.dry_run,
      timeline: order.timeline,
      cancellable_until: order.cancellable_until,
      total: order.total,
      as_of: iso(this.now()),
      ttl_seconds: terminal ? 86_400 : 60,
      next_step: terminal
        ? "Order is complete."
        : order.dry_run
          ? "DRY_RUN order: it will stay 'received' because it was never sent to the merchant."
          : "Check again in about a minute, or near the eta.",
    };
  }

  async cancelOrder(orderId: string, reason: string) {
    const status = await this.getOrderStatus(orderId);
    const stored = (await this.store.getOrder(orderId))!;
    const order = stored.order;
    if (order.status === "cancelled")
      return { order_id: orderId, cancelled: true, status: "cancelled" as const, message: "Already cancelled.", timeline: order.timeline };
    const now = this.now();
    const late = ["ready", "out_for_delivery", "delivered", "picked_up"].includes(status.status);
    if (late || (order.cancellable_until && now > new Date(order.cancellable_until))) {
      const loc = await this.location(order.location_id);
      throw new OrderableError(
        "CANCELLATION_WINDOW_CLOSED",
        late
          ? `Order is already ${status.status}; it can no longer be cancelled.`
          : `The cancellation window closed at ${order.cancellable_until}.`,
        null,
        { contact_phone: loc.phone ?? null, policy_resource: "orderable://policies" },
      );
    }
    if (!order.dry_run && stored.external_id) {
      const res = await this.adapter.cancelOrder(stored.external_id, reason, order);
      if (!res.cancelled)
        throw new OrderableError("CANCELLATION_WINDOW_CLOSED", res.message ?? "The merchant declined the cancellation", null);
    }
    const updated: Order = {
      ...order,
      status: "cancelled",
      timeline: [...status.timeline, { status: "cancelled", at: iso(now), note: reason }],
    };
    await this.store.updateOrder(updated);
    return { order_id: orderId, cancelled: true, status: "cancelled" as const, message: "Order cancelled.", timeline: updated.timeline };
  }

  // ---------------------------------------------------------------- group planning

  /**
   * Deterministic heuristic, no LLM. Covers each dietary requirement with individual
   * portions first (scarcest requirement first), fills the rest of the group with up to
   * three well-priced mains for variety, then adds drinks/dessert if the all-in budget
   * (tax and fees included) allows.
   */
  async planGroupOrder(input: {
    location_id: string;
    headcount: number;
    budget_per_person: number;
    dietary_requirements?: Partial<Record<DietaryTag, number>> | undefined;
    avoid_allergens?: Allergen[] | undefined;
    desired_time: string;
    fulfillment?: FulfillmentMode | undefined;
    extras?: ("drinks" | "dessert")[] | undefined;
  }) {
    const fulfillment = input.fulfillment ?? "pickup";
    const loc = await this.location(input.location_id);
    if (this.config.policy.max_headcount != null && input.headcount > this.config.policy.max_headcount)
      throw new OrderableError(
        "POLICY_BLOCKED",
        `Headcount ${input.headcount} exceeds the agent policy cap of ${this.config.policy.max_headcount}`,
        null,
        { violations: [{ code: "HEADCOUNT_CAP", limit: this.config.policy.max_headcount, actual: input.headcount }] },
      );
    const { ready } = this.resolveTiming(loc, fulfillment, input.desired_time);
    const desired = new Date(input.desired_time);
    const { menu, items } = await this.menuWithAvailability(loc.id, desired, fulfillment);
    const currency = menu.business.currency;
    const avoid = input.avoid_allergens ?? [];
    const warnings: string[] = [];
    const unmet: { constraint: string; reason: string }[] = [];

    type Cand = { item: Item; mods: SelectedModifier[]; unit: number; perServing: number; capacity: number };
    const cands: Cand[] = items
      .filter(({ availability }) => availability.orderable)
      .filter(({ item }) => !avoid.some((a) => item.allergens[a] === "contains" || item.allergens[a] === "may_contain"))
      .map(({ item, availability }) => {
        const mods = defaultModifiers(item);
        const unit =
          item.price.amount +
          mods.reduce((s, m) => {
            const opt = item.modifier_groups.find((g) => g.id === m.group_id)?.options.find((o) => o.id === m.option_id);
            return s + (opt?.price_delta.amount ?? 0);
          }, 0);
        const units = availability.quantity ?? 999;
        return { item, mods, unit, perServing: unit / item.serves, capacity: units * item.serves };
      });
    if (avoid.length) {
      const unknownAvoid = cands.filter((c) => avoid.some((a) => c.item.allergens[a] === "unknown"));
      if (unknownAvoid.length)
        warnings.push(
          `Allergen status unknown for ${unknownAvoid.map((c) => c.item.name).join(", ")} (${avoid.join(", ")}). Excluded from the plan.`,
        );
    }
    const safe = cands.filter((c) => !avoid.some((a) => c.item.allergens[a] === "unknown"));
    const mains = safe.filter((c) => c.item.role === "main");

    // Budget is all-in. Back out tax and fees to get a goods budget.
    const budgetTotal = input.headcount * input.budget_per_person;
    const fee = fulfillment === "delivery" ? (loc.delivery_fee?.amount ?? 0) : 0;
    const goodsBudget = Math.floor(budgetTotal / (1 + loc.tax_rate_bps / 10_000) - fee);
    const extras = input.extras ?? ["drinks"];
    const perPersonMainTarget = (goodsBudget * (extras.includes("drinks") ? 0.8 : 1)) / input.headcount;

    const servings = new Map<string, number>(); // item_id → servings allocated
    const covers = new Map<string, Map<string, number>>(); // item_id → label → people
    const used = (c: Cand) => servings.get(c.item.id) ?? 0;
    const allocate = (c: Cand, n: number, label: string) => {
      servings.set(c.item.id, used(c) + n);
      const m = covers.get(c.item.id) ?? new Map<string, number>();
      m.set(label, (m.get(label) ?? 0) + n);
      covers.set(c.item.id, m);
    };

    // 1. Dietary requirements, scarcest first, individual portions preferred.
    const reqs = (Object.entries(input.dietary_requirements ?? {}) as [DietaryTag, number][])
      .filter(([, n]) => n > 0)
      .map(([tag, n]) => ({ tag, n, pool: mains.filter((c) => hasDietaryTag(c.item, tag)) }))
      .sort((a, b) => a.pool.length - b.pool.length || a.tag.localeCompare(b.tag));
    const dietaryTotal = reqs.reduce((s, r) => s + r.n, 0);
    if (dietaryTotal > input.headcount)
      warnings.push(
        `Dietary counts add up to ${dietaryTotal}, more than headcount ${input.headcount}. Planned as if each count is a different person.`,
      );

    const coverage = reqs.map((r) => {
      let remaining = r.n;
      const chosen: string[] = [];
      const pool = [...r.pool].sort(
        (a, b) => Number(a.item.serves > 1) - Number(b.item.serves > 1) || a.perServing - b.perServing || a.item.id.localeCompare(b.item.id),
      );
      // Three or more people: split across the two best options so nobody gets a monotone lunch.
      const singles = pool.filter((c) => c.item.serves === 1);
      const split = r.n >= 3 && singles.length >= 2 ? Math.ceil(r.n / 2) : r.n;
      for (const c of pool) {
        if (remaining === 0) break;
        const share = chosen.length === 0 && c === singles[0] ? split : remaining;
        const take = Math.min(remaining, share, c.capacity - used(c));
        if (take <= 0) continue;
        allocate(c, take, r.tag);
        chosen.push(c.item.name);
        remaining -= take;
        if (r.tag === "gluten_free" && (c.item.allergens.gluten === "may_contain" || c.item.allergens.wheat === "may_contain"))
          warnings.push(`${c.item.name} is gluten-free by recipe but may contain gluten (shared kitchen). Confirm if anyone is celiac.`);
      }
      if (remaining > 0)
        unmet.push({
          constraint: `${r.tag} x${r.n}`,
          reason: r.pool.length
            ? `Only ${r.n - remaining} ${r.tag} portions available at that time`
            : `No orderable ${r.tag} mains at ${loc.name} for that time`,
        });
      return { requirement: r.tag, needed: r.n, covered: r.n - remaining, items: chosen };
    });

    // 2. Everyone else: up to three mains near the per-person target, for variety.
    const general = Math.max(0, input.headcount - dietaryTotal);
    if (general > 0) {
      const affordable = mains.filter((c) => c.perServing <= perPersonMainTarget && c.item.serves === 1);
      const pool = (affordable.length ? affordable : [...mains].sort((a, b) => a.perServing - b.perServing).slice(0, 1))
        .sort((a, b) => b.perServing - a.perServing || a.item.id.localeCompare(b.item.id))
        .slice(0, 3);
      let remaining = general;
      for (let i = 0, stalls = 0; remaining > 0 && pool.length && stalls < pool.length; i++) {
        const c = pool[i % pool.length]!;
        if (c.capacity - used(c) > 0) {
          allocate(c, 1, "general");
          remaining--;
          stalls = 0;
        } else stalls++;
      }
      // Overflow to any main with capacity, cheapest first.
      for (const c of [...mains].sort((a, b) => a.perServing - b.perServing)) {
        if (remaining === 0) break;
        const take = Math.min(remaining, c.capacity - used(c));
        if (take > 0) {
          allocate(c, take, "general");
          remaining -= take;
        }
      }
      if (remaining > 0) unmet.push({ constraint: `mains for ${general} people`, reason: `Not enough orderable mains: ${remaining} people uncovered` });
    }


    const toLines = () =>
      [...servings]
        .filter(([, n]) => n > 0)
        .map(([itemId, n]) => {
          const c = cands.find((x) => x.item.id === itemId)!;
          return { item_id: itemId, quantity: Math.ceil(n / c.item.serves), modifiers: c.mods };
        });

    const estimate = async (lines: OrderLineInput[]) =>
      (await this.adapter.quote({ location: loc, lines, fulfillment })).total.amount;

    let lines: OrderLineInput[] = toLines();
    if (lines.length && (await estimate(lines)) > budgetTotal)
      unmet.push({
        constraint: `budget ${formatMoney(money(input.budget_per_person, currency))}/person`,
        reason: "Mains alone exceed the budget once tax and fees are included",
      });

    // 3. Extras, only if they fit the all-in budget.
    const addExtra = async (role: "drink" | "dessert", label: string) => {
      const pool = safe.filter((c) => c.item.role === role || (role === "drink" && /drink|coffee|tea/i.test(c.item.category_id)));
      const options = pool
        .map((c) => {
          const qty = Math.ceil(input.headcount / c.item.serves);
          return { c, qty, cost: qty * c.unit };
        })
        .filter((o) => o.c.capacity >= input.headcount)
        .sort((a, b) => a.cost - b.cost || a.c.item.id.localeCompare(b.c.item.id));
      for (const o of options) {
        const trial = [...lines, { item_id: o.c.item.id, quantity: o.qty, modifiers: o.c.mods }];
        if ((await estimate(trial)) <= budgetTotal) {
          lines = trial;
          covers.set(o.c.item.id, new Map([[label, input.headcount]]));
          return;
        }
      }
      warnings.push(options.length ? `Skipped ${label}: not enough budget left.` : `Skipped ${label}: none orderable at that time.`);
    };
    if (lines.length && !unmet.some((u) => u.constraint.startsWith("budget"))) {
      if (extras.includes("drinks")) await addExtra("drink", "drinks");
      if (extras.includes("dessert")) await addExtra("dessert", "dessert");
    }

    const priced = lines.length ? await this.adapter.quote({ location: loc, lines, fulfillment }) : null;
    const unknownAllergenItems = lines
      .map((l) => cands.find((c) => c.item.id === l.item_id)!)
      .filter((c) => allergenLists(c.item).unknown.length === 12)
      .map((c) => c.item.name);
    if (unknownAllergenItems.length)
      warnings.push(`No allergen info at all for: ${unknownAllergenItems.join(", ")}. Treat as unknown, not safe.`);

    const mainsCovered = [...servings.values()].reduce((s, n) => s + n, 0);
    return {
      location_id: loc.id,
      location_name: loc.name,
      headcount: input.headcount,
      desired_time: iso(desired),
      ready_time: iso(ready),
      fulfillment,
      lines,
      line_details: (priced?.lines ?? []).map((pl: PricedLine) => ({
        item_id: pl.item_id,
        name: pl.name,
        quantity: pl.quantity,
        serves: pl.serves,
        covers: [...(covers.get(pl.item_id) ?? [])].map(([label, n]) => `${label} x${n}`),
        unit_price: pl.unit_price,
        line_total: pl.line_total,
      })),
      estimate: priced
        ? {
            subtotal: priced.subtotal,
            fees: priced.fees,
            tax: priced.tax,
            total: priced.total,
            budget_total: money(budgetTotal, currency),
            per_person: money(priced.total.amount / input.headcount, currency),
            within_budget: priced.total.amount <= budgetTotal,
          }
        : null,
      coverage: {
        people_with_a_main: Math.min(mainsCovered, input.headcount),
        headcount: input.headcount,
        dietary: coverage,
        fully_covered: unmet.length === 0,
      },
      unmet,
      warnings,
      as_of: menu.as_of,
      ttl_seconds: menu.ttl_seconds,
      next_step:
        unmet.length === 0
          ? "Review with the customer, then call quote_order with `lines` exactly as given (add delivery_address for delivery)."
          : "Some constraints are unmet. Adjust budget/time/location, or confirm with the customer before quoting.",
    };
  }

  // ---------------------------------------------------------------- resources

  async menuResource(locationId: string) {
    const { loc, menu, items } = await this.menuWithAvailability(locationId);
    return {
      location: { id: loc.id, name: loc.name, business: menu.business.name, timezone: loc.timezone, hours: loc.hours },
      categories: menu.categories.map((c) => ({
        ...c,
        items: items
          .filter(({ item }) => item.category_id === c.id)
          .map(({ item, availability }) => ({ ...item, availability })),
      })),
      as_of: menu.as_of,
      ttl_seconds: menu.ttl_seconds,
    };
  }

  async policiesResource() {
    const businesses = await this.adapter.listBusinesses();
    const locations = await this.adapter.listLocations();
    const p = this.config.policy;
    return {
      merchants: businesses.map((b) => ({
        business_id: b.id,
        name: b.name,
        cancellation: b.policies.cancellation,
        refund: b.policies.refund,
        payment: b.policies.payment,
        delivery: b.policies.delivery,
        delivery_fees: locations
          .filter((l) => l.business_id === b.id && l.delivery_fee)
          .map((l) => ({ location_id: l.id, fee: l.delivery_fee, minimum_subtotal: l.min_delivery_subtotal ?? null, zone: l.delivery_zone })),
      })),
      agent_spending_policy: {
        timezone: p.timezone,
        max_order_total: p.max_order_total_minor,
        max_daily_total: p.max_daily_total_minor,
        allowed_location_ids: p.allowed_location_ids,
        max_headcount: p.max_headcount,
        amounts_in: "minor units of the location currency",
      },
      ordering_rules: {
        quote_ttl_seconds: this.config.quote_ttl_seconds,
        dry_run: this.config.dry_run,
        payment_methods: this.config.payment.methods,
        confirm_required: true,
        card_data: "Never accepted over MCP. Payment is at pickup, on invoice, or via a merchant-hosted link.",
      },
      as_of: iso(this.now()),
      ttl_seconds: 3600,
    };
  }

  /** For CLI doctor and demos. */
  localDate(at = this.now()) {
    return localParts(at, this.config.policy.timezone).date;
  }
}

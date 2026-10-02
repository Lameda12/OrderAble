import { randomUUID } from "node:crypto";
import { OrderableError } from "../errors.js";
import { computeTotals, priceLine } from "../pricing.js";
import type { Catalog, Item, Order, OrderStatusValue, StockStatus, TimelineEvent } from "../schema.js";
import { addMinutes, iso } from "../time.js";
import type {
  Adapter,
  AdapterOrderRequest,
  AdapterOrderResult,
  AdapterOrderStatus,
  Menu,
  PricingRequest,
  PricingResult,
  StockChange,
  StockLevel,
} from "./types.js";

/**
 * Serves a business straight from a Catalog held in memory (the file and mock adapters).
 * Orders "sent" here are simulated: their status advances with the clock, so agents and
 * demos see a realistic received → accepted → preparing → ready timeline.
 */
export class LocalCatalogAdapter implements Adapter {
  readonly name: string = "local";
  protected catalog: Catalog;
  protected now: () => Date;
  private cancelled = new Map<string, string>();

  constructor(catalog: Catalog, opts: { now?: () => Date } = {}) {
    this.catalog = catalog;
    this.now = opts.now ?? (() => new Date());
  }

  async listBusinesses() {
    return this.catalog.businesses;
  }

  async listLocations() {
    return this.catalog.locations;
  }

  protected location(locationId: string) {
    const loc = this.catalog.locations.find((l) => l.id === locationId);
    if (!loc)
      throw new OrderableError("LOCATION_NOT_FOUND", `No location "${locationId}"`, "list_locations", {
        known_location_ids: this.catalog.locations.map((l) => l.id),
      });
    return loc;
  }

  protected itemsAt(locationId: string): Item[] {
    const loc = this.location(locationId);
    return this.catalog.items.filter(
      (i) => i.business_id === loc.business_id && (!i.location_ids || i.location_ids.includes(locationId)),
    );
  }

  protected stockAsOf(): string {
    return this.catalog.stock_as_of ?? iso(this.now());
  }

  async getMenu(locationId: string): Promise<Menu> {
    const loc = this.location(locationId);
    const business = this.catalog.businesses.find((b) => b.id === loc.business_id)!;
    return {
      location_id: locationId,
      business,
      categories: this.catalog.categories.filter((c) => c.business_id === loc.business_id),
      items: this.itemsAt(locationId),
      as_of: this.stockAsOf(),
      ttl_seconds: this.catalog.stock_ttl_seconds,
    };
  }

  async getItem(itemId: string) {
    return this.catalog.items.find((i) => i.id === itemId) ?? null;
  }

  async getAvailability(locationId: string, itemIds: string[]): Promise<StockLevel[]> {
    const offered = new Set(this.itemsAt(locationId).map((i) => i.id));
    return itemIds.map((itemId) => {
      const s = this.catalog.stock.find((x) => x.location_id === locationId && x.item_id === itemId);
      const status: StockStatus = !offered.has(itemId) ? "sold_out" : (s?.status ?? "unknown");
      return {
        item_id: itemId,
        location_id: locationId,
        status,
        quantity: offered.has(itemId) ? (s?.quantity ?? null) : 0,
        as_of: this.stockAsOf(),
        ttl_seconds: this.catalog.stock_ttl_seconds,
      };
    });
  }

  async quote(req: PricingRequest): Promise<PricingResult> {
    const offered = this.itemsAt(req.location.id);
    const business = this.catalog.businesses.find((b) => b.id === req.location.business_id)!;
    const lines = req.lines.map((line) => {
      const item = offered.find((i) => i.id === line.item_id);
      if (!item)
        throw new OrderableError(
          "ITEM_NOT_FOUND",
          `Item "${line.item_id}" is not sold at ${req.location.name}`,
          "search_menu",
          { item_id: line.item_id, location_id: req.location.id },
        );
      return priceLine(item, line);
    });
    return { lines, ...computeTotals(req.location, lines, req.fulfillment, business.currency) };
  }

  async placeOrder(req: AdapterOrderRequest): Promise<AdapterOrderResult> {
    // Decrement tracked quantities so the next availability check reflects the sale.
    for (const line of req.quote.lines) {
      const s = this.catalog.stock.find((x) => x.location_id === req.quote.location_id && x.item_id === line.item_id);
      if (s && s.quantity != null) {
        s.quantity = Math.max(0, s.quantity - line.quantity);
        if (s.quantity === 0) s.status = "sold_out";
        else if (s.quantity <= 3) s.status = "low";
      }
    }
    return { external_id: `local_${randomUUID().slice(0, 8)}`, status: "received" };
  }

  /** Simulated lifecycle derived from created_at and eta, so it survives restarts. */
  async getOrderStatus(externalId: string, order: Order): Promise<AdapterOrderStatus> {
    const now = this.now();
    const created = new Date(order.created_at);
    const eta = new Date(order.eta);
    const loc = this.catalog.locations.find((l) => l.id === order.location_id);
    const deliveryMins = order.fulfillment === "delivery" ? (loc?.delivery_minutes ?? 30) : 0;
    const readyAt = addMinutes(eta, -deliveryMins);
    const prepStart = new Date(Math.max(addMinutes(created, 2).getTime(), addMinutes(readyAt, -(loc?.prep_minutes ?? 15)).getTime()));

    const plan: TimelineEvent[] = [
      { status: "received", at: iso(created) },
      { status: "accepted", at: iso(addMinutes(created, 1)), note: "Merchant confirmed the order" },
      { status: "preparing", at: iso(prepStart) },
      { status: "ready", at: iso(readyAt) },
    ];
    if (order.fulfillment === "delivery")
      plan.push(
        { status: "out_for_delivery", at: iso(addMinutes(readyAt, 2)) },
        { status: "delivered", at: iso(eta) },
      );

    const cancelledAt = this.cancelled.get(externalId);
    const timeline = plan.filter((e) => new Date(e.at) <= now && (!cancelledAt || e.at <= cancelledAt));
    if (cancelledAt) timeline.push({ status: "cancelled", at: cancelledAt });
    const status: OrderStatusValue = timeline.at(-1)?.status ?? "received";
    return { status, timeline };
  }

  async cancelOrder(externalId: string) {
    this.cancelled.set(externalId, iso(this.now()));
    return { cancelled: true };
  }

  /** Owner stock updates. The data is now confirmed fresh, so the freshness clock restarts. */
  async updateStock(changes: StockChange[]) {
    for (const c of changes) this.setStock(c.location_id, c.item_id, c.status, c.quantity);
    if (this.catalog.stock_as_of !== null) this.catalog.stock_as_of = iso(this.now());
  }

  /** Test/demo helper: change stock at runtime. */
  setStock(locationId: string, itemId: string, status: StockStatus, quantity: number | null = null) {
    const s = this.catalog.stock.find((x) => x.location_id === locationId && x.item_id === itemId);
    if (s) Object.assign(s, { status, quantity });
    else this.catalog.stock.push({ location_id: locationId, item_id: itemId, status, quantity });
  }

  /** Test/demo helper: change an item's base price. */
  setPrice(itemId: string, amount: number) {
    const item = this.catalog.items.find((i) => i.id === itemId);
    if (item) item.price = { ...item.price, amount };
  }
}

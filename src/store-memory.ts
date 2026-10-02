import type { Order, Quote } from "./schema.js";
import type { Store, StoredOrder } from "./store.js";

/**
 * In-memory Store with the same semantics as SqliteStore. Used where native modules
 * are unavailable (serverless demos). Not durable: use SqliteStore for real merchants.
 */
export class MemoryStore implements Store {
  private quotes = new Map<string, { quote: Quote; used_by_order_id: string | null }>();
  private orders = new Map<string, StoredOrder>();
  private keys = new Map<string, string>();

  saveQuote(quote: Quote) {
    if (this.quotes.has(quote.quote_id)) throw new Error("duplicate quote id");
    this.quotes.set(quote.quote_id, { quote: structuredClone(quote), used_by_order_id: null });
  }
  getQuote(id: string) {
    const q = this.quotes.get(id);
    return q ? structuredClone(q) : null;
  }
  findOrderByIdempotencyKey(key: string) {
    const id = this.keys.get(key);
    return id ? this.getOrder(id) : null;
  }
  reserveOrder(order: Order, key: string) {
    const q = this.quotes.get(order.quote_id);
    if (!q || q.used_by_order_id || this.keys.has(key)) return false;
    q.used_by_order_id = order.order_id;
    this.keys.set(key, order.order_id);
    this.orders.set(order.order_id, { order: structuredClone(order), external_id: null, idempotency_key: key });
    return true;
  }
  releaseOrder(orderId: string) {
    const o = this.orders.get(orderId);
    if (!o) return;
    this.orders.delete(orderId);
    this.keys.delete(o.idempotency_key);
    const q = this.quotes.get(o.order.quote_id);
    if (q) q.used_by_order_id = null;
  }
  getOrder(orderId: string) {
    const o = this.orders.get(orderId);
    return o ? structuredClone(o) : null;
  }
  updateOrder(order: Order, externalId?: string | null) {
    const o = this.orders.get(order.order_id);
    if (!o) return;
    o.order = structuredClone(order);
    if (externalId) o.external_id = externalId;
  }
  ordersCreatedAfter(iso: string) {
    return [...this.orders.values()].map((o) => structuredClone(o.order)).filter((o) => o.created_at > iso);
  }
  close() {}
}

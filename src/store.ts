import Database from "better-sqlite3";
import type { Order, Quote } from "./schema.js";

export interface StoredOrder {
  order: Order;
  external_id: string | null;
  idempotency_key: string;
}

/** Persistence for quotes, orders and idempotency keys. Synchronous by design. */
export interface Store {
  saveQuote(quote: Quote): Promise<void>;
  getQuote(quoteId: string): Promise<{ quote: Quote; used_by_order_id: string | null } | null>;
  findOrderByIdempotencyKey(key: string): Promise<StoredOrder | null>;
  /**
   * Atomically: claim the idempotency key, mark the quote used, insert the order.
   * Returns false if the key or quote was claimed first (the caller re-reads).
   */
  reserveOrder(order: Order, idempotencyKey: string): Promise<boolean>;
  /** Undo a reservation when the merchant's system rejects the order. */
  releaseOrder(orderId: string): Promise<void>;
  getOrder(orderId: string): Promise<StoredOrder | null>;
  updateOrder(order: Order, externalId?: string | null): Promise<void>;
  ordersCreatedAfter(iso: string): Promise<Order[]>;
  close(): Promise<void> | void;
}

export class SqliteStore implements Store {
  private db: Database.Database;

  constructor(path = "orderable.db") {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS quotes (
        quote_id TEXT PRIMARY KEY,
        location_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        total_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_by_order_id TEXT
      );
      CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY,
        quote_id TEXT NOT NULL UNIQUE REFERENCES quotes(quote_id),
        idempotency_key TEXT NOT NULL UNIQUE,
        external_id TEXT,
        status TEXT NOT NULL,
        total_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,
        dry_run INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS orders_created_at ON orders(created_at);
    `);
  }

  async saveQuote(q: Quote) {
    this.db
      .prepare(
        `INSERT INTO quotes (quote_id, location_id, payload, total_minor, currency, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(q.quote_id, q.location_id, JSON.stringify(q), q.total.amount, q.total.currency, q.as_of, q.expires_at);
  }

  async getQuote(quoteId: string) {
    const row = this.db.prepare(`SELECT payload, used_by_order_id FROM quotes WHERE quote_id = ?`).get(quoteId) as
      | { payload: string; used_by_order_id: string | null }
      | undefined;
    return row ? { quote: JSON.parse(row.payload) as Quote, used_by_order_id: row.used_by_order_id } : null;
  }

  private rowToStored(row: { payload: string; external_id: string | null; idempotency_key: string } | undefined) {
    return row
      ? { order: JSON.parse(row.payload) as Order, external_id: row.external_id, idempotency_key: row.idempotency_key }
      : null;
  }

  async findOrderByIdempotencyKey(key: string) {
    return this.rowToStored(
      this.db.prepare(`SELECT payload, external_id, idempotency_key FROM orders WHERE idempotency_key = ?`).get(key) as never,
    );
  }

  async reserveOrder(order: Order, idempotencyKey: string): Promise<boolean> {
    const tx = this.db.transaction(() => {
      const claimed = this.db
        .prepare(`UPDATE quotes SET used_by_order_id = ? WHERE quote_id = ? AND used_by_order_id IS NULL`)
        .run(order.order_id, order.quote_id);
      if (claimed.changes !== 1) return false;
      this.db
        .prepare(
          `INSERT INTO orders (order_id, quote_id, idempotency_key, external_id, status, total_minor, currency, dry_run, created_at, payload)
           VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          order.order_id,
          order.quote_id,
          idempotencyKey,
          order.status,
          order.total.amount,
          order.total.currency,
          order.dry_run ? 1 : 0,
          order.created_at,
          JSON.stringify(order),
        );
      return true;
    });
    try {
      return tx();
    } catch (e) {
      if (e instanceof Error && /UNIQUE constraint failed/.test(e.message)) return false;
      throw e;
    }
  }

  async releaseOrder(orderId: string) {
    this.db.transaction(() => {
      this.db.prepare(`DELETE FROM orders WHERE order_id = ?`).run(orderId);
      this.db.prepare(`UPDATE quotes SET used_by_order_id = NULL WHERE used_by_order_id = ?`).run(orderId);
    })();
  }

  async getOrder(orderId: string) {
    return this.rowToStored(
      this.db.prepare(`SELECT payload, external_id, idempotency_key FROM orders WHERE order_id = ?`).get(orderId) as never,
    );
  }

  async updateOrder(order: Order, externalId?: string | null) {
    this.db
      .prepare(
        `UPDATE orders SET status = ?, payload = ?, external_id = COALESCE(?, external_id) WHERE order_id = ?`,
      )
      .run(order.status, JSON.stringify(order), externalId ?? null, order.order_id);
  }

  async ordersCreatedAfter(iso: string) {
    return (
      this.db.prepare(`SELECT payload FROM orders WHERE created_at > ? ORDER BY created_at`).all(iso) as { payload: string }[]
    ).map((r) => JSON.parse(r.payload) as Order);
  }

  close() {
    this.db.close();
  }
}

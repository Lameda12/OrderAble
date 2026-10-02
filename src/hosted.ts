import { createHash, randomBytes } from "node:crypto";
import { LocalCatalogAdapter } from "./adapters/local.js";
import { emptyCatalog } from "./adapters/file.js";
import type { MenuSource, StockChange } from "./adapters/types.js";
import type { OrderableConfig } from "./config.js";
import { createMcpServer, extractToken, serveMcp } from "./mcp.js";
import { MenuFile, normalizeMenu } from "./menu-format.js";
import { slugify } from "./owner.js";
import type { Order, Quote } from "./schema.js";
import { OrderableService } from "./service.js";
import type { Store, StoredOrder } from "./store.js";

/**
 * Hosted accounts. Each restaurant gets an account with two kinds of token:
 * - an owner token, whose URL the owner pastes into Claude as a connector to set up and
 *   change the menu by conversation (owner tools on);
 * - an agent token, for customers' agents and chat bots (ordering tools only).
 * Tokens are stored only as SHA-256 hashes. Menus, quotes and orders live in Postgres, so any
 * serverless instance can serve any request.
 */

/** The subset of node-postgres (and PGlite) that Orderable uses. */
export interface Db {
  query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS orderable_accounts (
    id text PRIMARY KEY,
    name text NOT NULL,
    dry_run boolean NOT NULL DEFAULT true,
    menu jsonb,
    menu_updated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS orderable_tokens (
    hash text PRIMARY KEY,
    account_id text NOT NULL REFERENCES orderable_accounts(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'agent')),
    last4 text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS orderable_quotes (
    quote_id text PRIMARY KEY,
    account_id text NOT NULL REFERENCES orderable_accounts(id) ON DELETE CASCADE,
    payload jsonb NOT NULL,
    total_minor integer NOT NULL,
    currency text NOT NULL,
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    used_by_order_id text
  )`,
  `CREATE TABLE IF NOT EXISTS orderable_orders (
    order_id text PRIMARY KEY,
    account_id text NOT NULL REFERENCES orderable_accounts(id) ON DELETE CASCADE,
    quote_id text NOT NULL UNIQUE,
    idempotency_key text NOT NULL,
    external_id text,
    status text NOT NULL,
    total_minor integer NOT NULL,
    currency text NOT NULL,
    dry_run boolean NOT NULL,
    created_at timestamptz NOT NULL,
    payload jsonb NOT NULL,
    UNIQUE (account_id, idempotency_key)
  )`,
  `CREATE INDEX IF NOT EXISTS orderable_orders_account_created ON orderable_orders (account_id, created_at)`,
  // Orderable connects as the database owner. Row-level security with no policies keeps these
  // tables closed to anything else, such as a provider's auto-generated REST API.
  `ALTER TABLE orderable_accounts ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE orderable_tokens ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE orderable_quotes ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE orderable_orders ENABLE ROW LEVEL SECURITY`,
];

export async function migrate(db: Db) {
  for (const stmt of SCHEMA) await db.query(stmt);
}

const json = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

// ---------------------------------------------------------------- accounts and tokens

export type Role = "owner" | "agent";

export interface Account {
  id: string;
  name: string;
  dry_run: boolean;
  created_at: string;
}

export async function createAccount(db: Db, name: string, opts: { live?: boolean } = {}): Promise<Account> {
  const id = `${slugify(name).slice(0, 40)}-${randomBytes(3).toString("hex")}`;
  const { rows } = await db.query<Account>(
    `INSERT INTO orderable_accounts (id, name, dry_run) VALUES ($1, $2, $3) RETURNING id, name, dry_run, created_at`,
    [id, name, !opts.live],
  );
  return rows[0]!;
}

/** Create a token and return it. It is shown once; only its hash is stored. */
export async function issueToken(db: Db, accountId: string, role: Role): Promise<string> {
  const token = `ord_${role}_${randomBytes(24).toString("base64url")}`;
  await db.query(`INSERT INTO orderable_tokens (hash, account_id, role, last4) VALUES ($1, $2, $3, $4)`, [
    hash(token),
    accountId,
    role,
    token.slice(-4),
  ]);
  return token;
}

/** Revoke every active token of a role, e.g. before issuing a replacement. */
export async function revokeTokens(db: Db, accountId: string, role: Role) {
  const { rows } = await db.query(
    `UPDATE orderable_tokens SET revoked_at = now() WHERE account_id = $1 AND role = $2 AND revoked_at IS NULL RETURNING hash`,
    [accountId, role],
  );
  return rows.length;
}

export async function resolveToken(db: Db, token: string): Promise<{ account: Account; role: Role } | null> {
  const { rows } = await db.query<Account & { role: Role }>(
    `SELECT a.id, a.name, a.dry_run, a.created_at, t.role
       FROM orderable_tokens t JOIN orderable_accounts a ON a.id = t.account_id
      WHERE t.hash = $1 AND t.revoked_at IS NULL`,
    [hash(token)],
  );
  const r = rows[0];
  return r ? { account: { id: r.id, name: r.name, dry_run: r.dry_run, created_at: r.created_at }, role: r.role } : null;
}

export async function setLive(db: Db, accountId: string, live: boolean) {
  await db.query(`UPDATE orderable_accounts SET dry_run = $2 WHERE id = $1`, [accountId, !live]);
}

export async function listAccounts(db: Db) {
  const { rows } = await db.query<Account & { has_menu: boolean; orders: number }>(
    `SELECT a.id, a.name, a.dry_run, a.created_at, (a.menu IS NOT NULL) AS has_menu,
            (SELECT count(*)::int FROM orderable_orders o WHERE o.account_id = a.id) AS orders
       FROM orderable_accounts a ORDER BY a.created_at`,
  );
  return rows;
}

// ---------------------------------------------------------------- menu

type Raw = Record<string, any>;

/** Same edit the file adapter makes to menu.yaml, on the menu's JSON form. */
export function applyStockChanges(menu: Raw, changes: StockChange[], nowIso: string): Raw {
  const next = structuredClone(menu);
  const allLocations = ((next.locations ?? []) as Raw[]).map((l) => l.id);
  const value = (c: StockChange) => (c.quantity == null ? c.status : { status: c.status, quantity: c.quantity });
  for (const itemId of new Set(changes.map((c) => c.item_id))) {
    const item = ((next.items ?? []) as Raw[]).find((i) => i.id === itemId);
    if (!item) continue;
    const mine = changes.filter((c) => c.item_id === itemId);
    const offeredAt: string[] = item.locations ?? allLocations;
    const same = mine.every((c) => c.status === mine[0]!.status && c.quantity === mine[0]!.quantity);
    const everywhere = offeredAt.every((l) => mine.some((c) => c.location_id === l));
    if (everywhere && same && !item.stock_by_location) item.stock = value(mine[0]!);
    else {
      item.stock_by_location = { ...(item.stock_by_location ?? {}) };
      for (const c of mine) item.stock_by_location[c.location_id] = value(c);
    }
  }
  if (next.stock_updated_at && next.stock_updated_at !== "live") next.stock_updated_at = nowIso;
  return next;
}

/** Serves one account's menu from the database; the owner tools read and write it. */
export class DbMenuAdapter extends LocalCatalogAdapter implements MenuSource {
  override readonly name = "hosted";
  private menu: Raw | null;

  private constructor(
    private readonly db: Db,
    private readonly accountId: string,
    menu: Raw | null,
    opts: { now?: () => Date },
  ) {
    super(menu ? normalizeMenu(MenuFile.parse(menu)) : emptyCatalog(), opts);
    this.menu = menu;
  }

  static async load(db: Db, accountId: string, opts: { now?: () => Date } = {}) {
    const { rows } = await db.query<{ menu: unknown }>(`SELECT menu FROM orderable_accounts WHERE id = $1`, [accountId]);
    const menu = rows[0]?.menu ? json<Raw>(rows[0].menu) : null;
    return new DbMenuAdapter(db, accountId, menu, opts);
  }

  async readMenu() {
    return this.menu ? structuredClone(this.menu) : null;
  }

  async writeMenu(menu: Record<string, unknown>) {
    const catalog = normalizeMenu(MenuFile.parse(menu));
    await this.db.query(`UPDATE orderable_accounts SET menu = $2::jsonb, menu_updated_at = now() WHERE id = $1`, [
      this.accountId,
      JSON.stringify(menu),
    ]);
    this.menu = menu;
    this.catalog = catalog;
  }

  override async updateStock(changes: StockChange[]) {
    if (!this.menu) return;
    await this.writeMenu(applyStockChanges(this.menu, changes, this.now().toISOString()));
  }
}

// ---------------------------------------------------------------- quotes and orders

/** The same contract as SqliteStore, scoped to one account. Each write is one atomic statement. */
export class PgStore implements Store {
  constructor(
    private readonly db: Db,
    private readonly accountId: string,
  ) {}

  async saveQuote(q: Quote) {
    await this.db.query(
      `INSERT INTO orderable_quotes (quote_id, account_id, payload, total_minor, currency, created_at, expires_at)
       VALUES ($1, $2, $3::jsonb, $4::int, $5, $6::timestamptz, $7::timestamptz)`,
      [q.quote_id, this.accountId, JSON.stringify(q), q.total.amount, q.total.currency, q.as_of, q.expires_at],
    );
  }

  async getQuote(quoteId: string) {
    const { rows } = await this.db.query(
      `SELECT payload, used_by_order_id FROM orderable_quotes WHERE account_id = $1 AND quote_id = $2`,
      [this.accountId, quoteId],
    );
    const r = rows[0];
    return r ? { quote: json<Quote>(r.payload), used_by_order_id: r.used_by_order_id as string | null } : null;
  }

  private toStored(r: any): StoredOrder | null {
    return r ? { order: json<Order>(r.payload), external_id: r.external_id, idempotency_key: r.idempotency_key } : null;
  }

  async findOrderByIdempotencyKey(key: string) {
    const { rows } = await this.db.query(
      `SELECT payload, external_id, idempotency_key FROM orderable_orders WHERE account_id = $1 AND idempotency_key = $2`,
      [this.accountId, key],
    );
    return this.toStored(rows[0]);
  }

  /**
   * Insert the order only if the quote is unused, then mark the quote, in one statement.
   * The unique constraints on quote_id and (account_id, idempotency_key) decide races:
   * a concurrent duplicate inserts nothing and gets false back.
   */
  async reserveOrder(order: Order, idempotencyKey: string) {
    const { rows } = await this.db.query(
      `WITH ins AS (
         INSERT INTO orderable_orders
           (order_id, account_id, quote_id, idempotency_key, status, total_minor, currency, dry_run, created_at, payload)
         SELECT $1, $2, $3, $4, $5, $6::int, $7, $8::boolean, $9::timestamptz, $10::jsonb
          WHERE EXISTS (SELECT 1 FROM orderable_quotes WHERE account_id = $2 AND quote_id = $3 AND used_by_order_id IS NULL)
         ON CONFLICT DO NOTHING
         RETURNING order_id
       )
       UPDATE orderable_quotes SET used_by_order_id = (SELECT order_id FROM ins)
        WHERE account_id = $2 AND quote_id = $3 AND EXISTS (SELECT 1 FROM ins)
       RETURNING quote_id`,
      [
        order.order_id,
        this.accountId,
        order.quote_id,
        idempotencyKey,
        order.status,
        order.total.amount,
        order.total.currency,
        order.dry_run,
        order.created_at,
        JSON.stringify(order),
      ],
    );
    return rows.length === 1;
  }

  async releaseOrder(orderId: string) {
    await this.db.query(
      `WITH del AS (DELETE FROM orderable_orders WHERE account_id = $1 AND order_id = $2 RETURNING quote_id)
       UPDATE orderable_quotes SET used_by_order_id = NULL WHERE account_id = $1 AND quote_id IN (SELECT quote_id FROM del)`,
      [this.accountId, orderId],
    );
  }

  async getOrder(orderId: string) {
    const { rows } = await this.db.query(
      `SELECT payload, external_id, idempotency_key FROM orderable_orders WHERE account_id = $1 AND order_id = $2`,
      [this.accountId, orderId],
    );
    return this.toStored(rows[0]);
  }

  async updateOrder(order: Order, externalId?: string | null) {
    await this.db.query(
      `UPDATE orderable_orders SET status = $3, payload = $4::jsonb, external_id = COALESCE($5, external_id)
        WHERE account_id = $1 AND order_id = $2`,
      [this.accountId, order.order_id, order.status, JSON.stringify(order), externalId ?? null],
    );
  }

  async ordersCreatedAfter(iso: string) {
    const { rows } = await this.db.query(
      `SELECT payload FROM orderable_orders WHERE account_id = $1 AND created_at > $2::timestamptz ORDER BY created_at`,
      [this.accountId, iso],
    );
    return rows.map((r) => json<Order>(r.payload));
  }

  close() {}
}

// ---------------------------------------------------------------- HTTP

/**
 * Multi-tenant MCP endpoint. The token picks the account and the role; each request gets a
 * fresh service bound to that account, so nothing depends on which instance serves it.
 */
export function createHostedHandler(opts: { db: Db; config: OrderableConfig; now?: () => Date }) {
  return async (request: Request): Promise<Response> => {
    const token = extractToken(request);
    const hit = token ? await resolveToken(opts.db, token) : null;
    if (!hit)
      return new Response(JSON.stringify({ error: "unauthorized", hint: "Use the URL or token from your Orderable account" }), {
        status: 401,
        headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="orderable"' },
      });
    const service = new OrderableService({
      adapter: await DbMenuAdapter.load(opts.db, hit.account.id, opts.now ? { now: opts.now } : {}),
      store: new PgStore(opts.db, hit.account.id),
      config: { ...opts.config, dry_run: hit.account.dry_run },
      ...(opts.now ? { now: opts.now } : {}),
    });
    return serveMcp(createMcpServer(service, { owner: hit.role === "owner" }), request);
  };
}

/** The two URLs to give an owner: one for their own assistant, one for customers' agents. */
export const accountUrls = (base: string, ownerToken: string, agentToken: string) => ({
  owner_url: `${base.replace(/\/$/, "")}/mcp/${ownerToken}`,
  agent_url: `${base.replace(/\/$/, "")}/mcp/${agentToken}`,
});

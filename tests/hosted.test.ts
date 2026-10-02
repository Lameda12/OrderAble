import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { type Db, createAccount, createHostedHandler, issueToken, listAccounts, migrate, revokeTokens, setLive } from "../src/hosted.js";

const now = () => new Date("2026-10-07T13:00:00Z"); // Wednesday 10:00 in Halifax

let db: Db;
beforeEach(async () => {
  db = new PGlite() as unknown as Db;
  await migrate(db);
  await migrate(db); // migrations are re-runnable
});

/** A fresh handler stands in for a fresh serverless instance: no shared memory, only the database. */
const instance = () => createHostedHandler({ db, config: defaultConfig({ adapter: "file" }), now });

let rpcId = 0;
async function rpc(token: string, method: string, params: Record<string, unknown> = {}, handler = instance()) {
  const res = await handler(
    new Request(`https://orderable.example/api/mcp/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
  );
  if (res.status !== 200) return { status: res.status, data: null as any, isError: true };
  const body = await res.json();
  const result = body.result;
  const text: string | undefined = result?.content?.[0]?.text;
  const parse = (t: string) => {
    try {
      return JSON.parse(t);
    } catch {
      return { message: t };
    }
  };
  const data = result?.structuredContent ?? (text ? parse(text) : result);
  return { status: 200, data, isError: !!result?.isError };
}
const call = (token: string, name: string, args: Record<string, unknown> = {}, handler?: ReturnType<typeof instance>) =>
  rpc(token, "tools/call", { name, arguments: args }, handler);

async function restaurant(name: string) {
  const account = await createAccount(db, name);
  return { account, owner: await issueToken(db, account.id, "owner"), agent: await issueToken(db, account.id, "agent") };
}

const rosies = {
  name: "Rosie's Bakeshop",
  type: "bakery",
  locations: [
    {
      name: "Rosie's North End",
      address: { line1: "2500 Agricola St", city: "Halifax", region: "NS", postal_code: "B3K 4C1" },
      hours: { mon: "07:00-17:00", tue: "07:00-17:00", wed: "07:00-17:00", thu: "07:00-17:00", fri: "07:00-17:00" },
      tax_rate: 14,
    },
  ],
};

describe("hosted accounts", () => {
  it("lets an owner set up by URL, and customers' agents order, across instances", async () => {
    const r = await restaurant("Rosie's Bakeshop");
    expect(r.owner).toMatch(/^ord_owner_/);
    expect(r.agent).toMatch(/^ord_agent_/);

    // The owner token sees owner tools; the agent token never does.
    const ownerTools = (await rpc(r.owner, "tools/list")).data.tools.map((t: { name: string }) => t.name);
    const agentTools = (await rpc(r.agent, "tools/list")).data.tools.map((t: { name: string }) => t.name);
    expect(ownerTools).toHaveLength(14);
    expect(agentTools).toHaveLength(9);
    expect((await call(r.agent, "owner_get_setup")).isError).toBe(true);

    // Owner sets up from nothing, each call on a different instance.
    expect((await call(r.owner, "owner_get_setup")).data.has_menu).toBe(false);
    expect((await call(r.owner, "owner_save_business", rosies)).isError).toBe(false);
    const items = await call(r.owner, "owner_upsert_items", {
      items: [
        { name: "Tomato Soup", category: "Lunch", price: 7, role: "main", allergens: { contains: ["milk"] } },
        { name: "Butter Croissant", category: "Pastries", price: 3.75 },
      ],
    });
    expect(items.data.created).toEqual(["tomato-soup", "butter-croissant"]);

    // A customer's agent quotes on one instance and orders on another.
    const locs = await call(r.agent, "list_locations");
    expect(locs.data.locations.map((l: { id: string }) => l.id)).toEqual(["rosie-s-north-end"]);
    const quote = await call(r.agent, "quote_order", {
      location_id: "rosie-s-north-end",
      lines: [{ item_id: "tomato-soup", quantity: 2 }],
      fulfillment: "pickup",
    });
    expect(quote.data.subtotal).toEqual({ amount: 1400, currency: "CAD" });
    const args = { quote_id: quote.data.quote_id, idempotency_key: "hosted-key-001", customer: { name: "Sam", phone: "902-555-0100" }, confirm: true };
    const placed = await call(r.agent, "place_order", args);
    expect(placed.data.idempotent_replay).toBe(false);
    expect(placed.data.order.dry_run).toBe(true); // new accounts start in test mode

    // A retry that lands on another instance still returns the same order.
    const retry = await call(r.agent, "place_order", args);
    expect(retry.data.idempotent_replay).toBe(true);
    expect(retry.data.order.order_id).toBe(placed.data.order.order_id);
    const status = await call(r.agent, "get_order_status", { order_id: placed.data.order.order_id });
    expect(status.data.status).toBe("received");

    // Owner stock updates persist for everyone.
    expect((await call(r.owner, "owner_update_stock", { message: "out of tomato soup" })).data.changed).toBe(true);
    const avail = await call(r.agent, "check_availability", { location_id: "rosie-s-north-end", item_ids: ["tomato-soup"] });
    expect(avail.data.availability[0].status).toBe("sold_out");
  });

  it("keeps accounts apart", async () => {
    const a = await restaurant("Rosie's Bakeshop");
    const b = await restaurant("Harbour Noodle Bar");
    await call(a.owner, "owner_save_business", rosies);
    const fromB = await call(b.agent, "list_locations");
    expect(fromB.data.locations).toEqual([]);
    const sneaky = await call(b.agent, "get_item", { item_id: "tomato-soup" });
    expect(sneaky.isError).toBe(true);
    const accounts = await listAccounts(db);
    expect(accounts.map((x) => x.has_menu)).toEqual([true, false]);
  });

  it("rejects unknown and revoked tokens, and can go live", async () => {
    const r = await restaurant("Rosie's Bakeshop");
    expect((await rpc("ord_agent_made_up", "tools/list")).status).toBe(401);
    await revokeTokens(db, r.account.id, "owner");
    expect((await rpc(r.owner, "tools/list")).status).toBe(401);
    expect((await rpc(r.agent, "tools/list")).status).toBe(200);

    const fresh = await issueToken(db, r.account.id, "owner");
    await call(fresh, "owner_save_business", rosies);
    await call(fresh, "owner_upsert_items", { items: [{ name: "Tomato Soup", category: "Lunch", price: 7 }] });
    await setLive(db, r.account.id, true);
    const q = await call(r.agent, "quote_order", {
      location_id: "rosie-s-north-end",
      lines: [{ item_id: "tomato-soup", quantity: 1 }],
      fulfillment: "pickup",
    });
    const o = await call(r.agent, "place_order", {
      quote_id: q.data.quote_id,
      idempotency_key: "live-key-0001",
      customer: { name: "Sam", phone: "902-555-0100" },
      confirm: true,
    });
    expect(o.data.order.dry_run).toBe(false);
  });

  it("never stores tokens in plain text", async () => {
    const r = await restaurant("Rosie's Bakeshop");
    const { rows } = await db.query<{ hash: string; last4: string }>("SELECT hash, last4 FROM orderable_tokens");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.hash).toMatch(/^[0-9a-f]{64}$/);
      expect([r.owner, r.agent]).not.toContain(row.hash);
    }
  });
});

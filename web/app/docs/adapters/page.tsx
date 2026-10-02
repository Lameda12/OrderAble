import type { Metadata } from "next";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Write an adapter · Orderable Docs" };

export default function Adapters() {
  return (
    <>
      <h1>Write an adapter</h1>
      <p className="lead">
        An adapter connects one point-of-sale system. Orderable handles hours, lead times, zones, quotes, policy, idempotency and storage, so the
        adapter only translates.
      </p>
      <pre>
        <code>{`interface Adapter {
  readonly name: string;
  listBusinesses(): Promise<Business[]>;
  listLocations(): Promise<Location[]>;
  getMenu(locationId: string): Promise<Menu>;
  getItem(itemId: string): Promise<Item | null>;
  getAvailability(locationId: string, itemIds: string[]): Promise<StockLevel[]>;
  quote(req: PricingRequest): Promise<PricingResult>;
  placeOrder(req: AdapterOrderRequest): Promise<AdapterOrderResult>;
  getOrderStatus(externalId: string, order: Order): Promise<AdapterOrderStatus>;
  cancelOrder(externalId: string, reason: string, order: Order): Promise<{ cancelled: boolean }>;
}`}</code>
      </pre>
      <h2>Rules</h2>
      <ol>
        <li>
          <strong>Map, don't invent.</strong> No allergen data in the POS means all <code>unknown</code>. Untracked stock means{" "}
          <code>status: "unknown"</code>.
        </li>
        <li>
          <strong>Be honest about freshness.</strong> <code>as_of</code> is when the POS last confirmed the data, not when you read your cache.
        </li>
        <li>
          <strong>Money in minor units</strong> with an explicit currency.
        </li>
        <li>
          <strong>Throw <code>OrderableError</code></strong> for expected failures; anything else becomes <code>ADAPTER_ERROR</code>.
        </li>
        <li>
          <strong>Use Orderable's order_id as the POS idempotency key</strong> so a retried send never duplicates there either.
        </li>
      </ol>
      <h2>Start from</h2>
      <ul>
        <li>
          <code>src/adapters/local.ts</code>: extend it if your source can produce a whole catalog (CSV, Google Sheet, JSON API).
        </li>
        <li>
          <code>src/adapters/square.ts</code>: a partial real POS adapter with TODOs.
        </li>
        <li>
          Register it in <code>createAdapter</code> (<code>src/server.ts</code>) and add a quote → order test.
        </li>
      </ul>
      <p>
        Planned: Square (finish), Toast, Clover, Shopify, Lightspeed. <a href={`${SITE.github}/issues/new`}>Tell us which one you need.</a>
      </p>
    </>
  );
}

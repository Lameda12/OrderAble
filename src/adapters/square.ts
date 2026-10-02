import { OrderableError } from "../errors.js";
import { allergenMap } from "../menu-format.js";
import type { Business, Item, Location, Order } from "../schema.js";
import type {
  Adapter,
  AdapterOrderRequest,
  AdapterOrderResult,
  AdapterOrderStatus,
  Menu,
  PricingRequest,
  PricingResult,
  StockLevel,
} from "./types.js";

/**
 * Square adapter (v0.2, experimental). Locations and catalog reads are wired against the
 * Square REST API; ordering is not yet. Until it is, use the file adapter for live orders.
 *
 * Env: SQUARE_ACCESS_TOKEN, SQUARE_ENV=sandbox|production
 *
 * TODO(v0.2):
 * - getAvailability: map Inventory API counts (POST /v2/inventory/counts/batch-retrieve) to StockLevel
 * - quote: POST /v2/orders/calculate with line items + service charges, map taxes/fees
 * - placeOrder: POST /v2/orders (idempotency_key = Orderable order_id), then a payment link
 *   via POST /v2/online-checkout/payment-links. Never collect card data in MCP.
 * - getOrderStatus: map Square fulfillment states (PROPOSED, RESERVED, PREPARED, COMPLETED, CANCELED)
 * - cancelOrder: PUT /v2/orders/{id} with fulfillment state CANCELED
 * - allergens: Square has no allergen model; read from item custom attributes, else unknown
 * - webhooks: order.fulfillment.updated → push status instead of polling
 */
export class SquareAdapter implements Adapter {
  readonly name = "square";
  private readonly base: string;

  constructor(
    private readonly token = process.env.SQUARE_ACCESS_TOKEN ?? "",
    env = process.env.SQUARE_ENV ?? "sandbox",
  ) {
    if (!token) throw new OrderableError("ADAPTER_ERROR", "SQUARE_ACCESS_TOKEN is not set");
    this.base = env === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "Square-Version": "2025-01-23",
        ...init.headers,
      },
    });
    if (!res.ok) throw new OrderableError("ADAPTER_ERROR", `Square ${path} failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  private notYet(what: string): never {
    throw new OrderableError(
      "ADAPTER_ERROR",
      `The Square adapter does not support ${what} yet (planned for v0.2). Use the file adapter for live ordering.`,
    );
  }

  async listBusinesses(): Promise<Business[]> {
    const { merchant } = await this.api<{ merchant: { id: string; business_name: string; currency: string } }>(
      "/v2/merchants/me",
    );
    return [
      {
        id: merchant.id,
        name: merchant.business_name,
        type: "restaurant",
        currency: merchant.currency,
        policies: {
          cancellation: { free_within_minutes: 5, until_minutes_before_ready: 60, summary: "Set in orderable.config.yaml" },
          refund: "Contact the merchant.",
          delivery: "Pickup only via Square in v0.2.",
          payment: "Square payment link.",
        },
      },
    ];
  }

  async listLocations(): Promise<Location[]> {
    type SqLoc = {
      id: string;
      name: string;
      business_name?: string;
      merchant_id: string;
      timezone?: string;
      currency?: string;
      address?: { address_line_1?: string; locality?: string; administrative_district_level_1?: string; postal_code?: string; country?: string };
      coordinates?: { latitude: number; longitude: number };
      business_hours?: { periods?: { day_of_week: string; start_local_time: string; end_local_time: string }[] };
    };
    const { locations = [] } = await this.api<{ locations?: SqLoc[] }>("/v2/locations");
    return locations.map((l) => ({
      id: l.id,
      business_id: l.merchant_id,
      business_name: l.business_name ?? l.name,
      business_type: "restaurant" as const,
      name: l.name,
      address: {
        line1: l.address?.address_line_1 ?? "",
        city: l.address?.locality ?? "",
        region: l.address?.administrative_district_level_1 ?? "",
        postal_code: l.address?.postal_code ?? "",
        country: l.address?.country ?? "CA",
        ...(l.coordinates ? { lat: l.coordinates.latitude, lng: l.coordinates.longitude } : {}),
      },
      timezone: l.timezone ?? "UTC",
      hours: (l.business_hours?.periods ?? []).map((p) => ({
        day: p.day_of_week.slice(0, 3).toLowerCase() as Location["hours"][number]["day"],
        open: p.start_local_time.slice(0, 5),
        close: p.end_local_time.slice(0, 5),
      })),
      fulfillment_modes: ["pickup" as const],
      prep_minutes: 15,
      delivery_minutes: 30,
      tax_rate_bps: 0, // TODO: read from Square tax catalog objects
    }));
  }

  async getMenu(locationId: string): Promise<Menu> {
    type SqObj = {
      id: string;
      type: string;
      present_at_all_locations?: boolean;
      present_at_location_ids?: string[];
      item_data?: {
        name: string;
        description?: string;
        category_id?: string;
        categories?: { id: string }[];
        variations?: { id: string; item_variation_data: { price_money?: { amount: number; currency: string } } }[];
      };
      category_data?: { name: string };
    };
    const [business] = await this.listBusinesses();
    const { objects = [] } = await this.api<{ objects?: SqObj[] }>("/v2/catalog/list?types=ITEM,CATEGORY");
    const items: Item[] = objects
      .filter((o) => o.type === "ITEM" && (o.present_at_all_locations || o.present_at_location_ids?.includes(locationId)))
      .flatMap((o) => {
        const v = o.item_data?.variations?.[0];
        const price = v?.item_variation_data.price_money;
        if (!o.item_data || !v || !price) return [];
        return [
          {
            id: v.id,
            business_id: business!.id,
            category_id: o.item_data.categories?.[0]?.id ?? o.item_data.category_id ?? "uncategorized",
            name: o.item_data.name,
            description: o.item_data.description ?? "",
            price: { amount: price.amount, currency: price.currency },
            modifier_groups: [], // TODO: map modifier_list_info
            dietary_tags: [],
            allergens: allergenMap(undefined),
            role: "other" as const,
            lead_time_minutes: 0,
            serves: 1,
          },
        ];
      });
    return {
      location_id: locationId,
      business: business!,
      categories: objects
        .filter((o) => o.type === "CATEGORY")
        .map((o) => ({ id: o.id, business_id: business!.id, name: o.category_data?.name ?? o.id })),
      items,
      as_of: new Date().toISOString(),
      ttl_seconds: 300,
    };
  }

  async getItem(itemId: string): Promise<Item | null> {
    const locations = await this.listLocations();
    for (const loc of locations) {
      const hit = (await this.getMenu(loc.id)).items.find((i) => i.id === itemId);
      if (hit) return hit;
    }
    return null;
  }

  async getAvailability(_locationId: string, _itemIds: string[]): Promise<StockLevel[]> {
    return this.notYet("inventory");
  }
  async quote(_req: PricingRequest): Promise<PricingResult> {
    return this.notYet("quoting");
  }
  async placeOrder(_req: AdapterOrderRequest): Promise<AdapterOrderResult> {
    return this.notYet("placing orders");
  }
  async getOrderStatus(_externalId: string, _order: Order): Promise<AdapterOrderStatus> {
    return this.notYet("order status");
  }
  async cancelOrder(_externalId: string, _reason: string, _order: Order): Promise<{ cancelled: boolean }> {
    return this.notYet("cancellation");
  }
}

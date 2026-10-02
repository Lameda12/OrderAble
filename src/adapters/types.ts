import type {
  Address,
  Business,
  Category,
  CustomerContact,
  Fee,
  FulfillmentMode,
  Item,
  Location,
  Money,
  Order,
  OrderLineInput,
  OrderStatusValue,
  Payment,
  PricedLine,
  Quote,
  StockStatus,
  TimelineEvent,
} from "../schema.js";

/** Raw stock as the merchant's system reports it. The service layers hours and lead times on top. */
export interface StockLevel {
  item_id: string;
  location_id: string;
  status: StockStatus;
  quantity: number | null;
  as_of: string;
  ttl_seconds: number;
}

export interface Menu {
  location_id: string;
  business: Business;
  categories: Category[];
  items: Item[];
  as_of: string;
  ttl_seconds: number;
}

export interface PricingRequest {
  location: Location;
  lines: OrderLineInput[];
  fulfillment: FulfillmentMode;
  delivery_address?: Address;
}

export interface PricingResult {
  lines: PricedLine[];
  subtotal: Money;
  fees: Fee[];
  tax: Money;
  total: Money;
}

export interface AdapterOrderRequest {
  order_id: string;
  quote: Quote;
  customer: CustomerContact;
  payment: Payment;
}

export interface AdapterOrderResult {
  /** The id in the merchant's system (POS order id). */
  external_id: string;
  status: OrderStatusValue;
  /** Optional merchant-hosted payment page returned by the POS. */
  payment_url?: string;
}

export interface AdapterOrderStatus {
  status: OrderStatusValue;
  timeline: TimelineEvent[];
}

/**
 * The contract every POS integration implements. Orderable handles quoting rules,
 * policy, idempotency, and persistence; an adapter only translates to and from the
 * merchant's system. Throw `OrderableError` for expected failures.
 */
export interface Adapter {
  readonly name: string;
  listBusinesses(): Promise<Business[]>;
  listLocations(): Promise<Location[]>;
  getMenu(locationId: string): Promise<Menu>;
  getItem(itemId: string): Promise<Item | null>;
  getAvailability(locationId: string, itemIds: string[]): Promise<StockLevel[]>;
  /** Price a cart. Must validate modifiers and item/location membership. */
  quote(req: PricingRequest): Promise<PricingResult>;
  placeOrder(req: AdapterOrderRequest): Promise<AdapterOrderResult>;
  getOrderStatus(externalId: string, order: Order): Promise<AdapterOrderStatus>;
  cancelOrder(externalId: string, reason: string, order: Order): Promise<{ cancelled: boolean; message?: string }>;
}

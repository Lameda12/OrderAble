import { z } from "zod";

/**
 * Canonical domain model. Every adapter maps its source (YAML, Square, Toast, ...)
 * into these shapes, and every tool input/output is defined from them.
 *
 * Conventions:
 * - Money is always integer minor units plus an explicit ISO 4217 currency.
 * - Anything carrying prices or availability carries `as_of` + `ttl_seconds`.
 * - Allergens are tri-state. Missing data is `unknown`, never "safe".
 */

export const Currency = z
  .string()
  .regex(/^[A-Z]{3}$/, "ISO 4217 currency code, e.g. CAD");

export const Money = z.object({
  amount: z.number().int().describe("Integer minor units (cents). 1295 = $12.95"),
  currency: Currency,
});
export type Money = z.infer<typeof Money>;

export const IsoDateTime = z.string().datetime({ offset: true });

export const Freshness = {
  as_of: IsoDateTime.describe("When this data was last known to be true"),
  ttl_seconds: z
    .number()
    .int()
    .nonnegative()
    .describe("Treat the data as stale after as_of + ttl_seconds"),
};

export const FulfillmentMode = z.enum(["pickup", "delivery", "dine_in", "catering"]);
export type FulfillmentMode = z.infer<typeof FulfillmentMode>;

export const BusinessType = z.enum(["restaurant", "cafe", "bakery", "delivery"]);
export type BusinessType = z.infer<typeof BusinessType>;

export const DietaryTag = z.enum([
  "vegetarian",
  "vegan",
  "gluten_free",
  "dairy_free",
  "nut_free",
  "halal",
  "kosher",
]);
export type DietaryTag = z.infer<typeof DietaryTag>;

/** Health Canada priority allergens plus gluten. */
export const ALLERGENS = [
  "gluten",
  "wheat",
  "milk",
  "egg",
  "peanut",
  "tree_nut",
  "sesame",
  "soy",
  "fish",
  "shellfish",
  "mustard",
  "sulphites",
] as const;
export const Allergen = z.enum(ALLERGENS);
export type Allergen = z.infer<typeof Allergen>;

export const AllergenStatus = z.enum(["contains", "may_contain", "unknown"]);
export type AllergenStatus = z.infer<typeof AllergenStatus>;

/** Full map: every allergen is always present. Unknown means "the merchant has not said". */
export const AllergenMap = z.record(Allergen, AllergenStatus);
export type AllergenMap = Record<Allergen, AllergenStatus>;

export const Weekday = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
export type Weekday = z.infer<typeof Weekday>;

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "24h time HH:MM");

export const OpeningHours = z.object({
  day: Weekday,
  open: HHMM,
  close: HHMM,
});
export type OpeningHours = z.infer<typeof OpeningHours>;

export const Address = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  region: z.string().min(1).describe("Province/state code, e.g. NS"),
  postal_code: z.string().min(1),
  country: z.string().length(2).describe("ISO 3166-1 alpha-2, e.g. CA"),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type Address = z.infer<typeof Address>;

export const DeliveryZone = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("radius"),
    radius_km: z.number().positive(),
  }),
  z.object({
    type: z.literal("postal_codes"),
    prefixes: z.array(z.string().min(1)).min(1).describe("Postal code prefixes, e.g. B3J"),
  }),
]);
export type DeliveryZone = z.infer<typeof DeliveryZone>;

export const Location = z.object({
  id: z.string(),
  business_id: z.string(),
  business_name: z.string(),
  business_type: BusinessType,
  name: z.string(),
  address: Address,
  phone: z.string().optional(),
  timezone: z.string().describe("IANA timezone, e.g. America/Halifax"),
  hours: z.array(OpeningHours),
  fulfillment_modes: z.array(FulfillmentMode).min(1),
  delivery_zone: DeliveryZone.optional(),
  delivery_fee: Money.optional(),
  min_delivery_subtotal: Money.optional(),
  prep_minutes: z.number().int().nonnegative().describe("Typical prep time for ASAP orders"),
  delivery_minutes: z.number().int().nonnegative().default(30),
  tax_rate_bps: z.number().int().nonnegative().describe("Sales tax in basis points. 1400 = 14%"),
});
export type Location = z.infer<typeof Location>;

export const Category = z.object({
  id: z.string(),
  business_id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});
export type Category = z.infer<typeof Category>;

export const ModifierOption = z.object({
  id: z.string(),
  name: z.string(),
  price_delta: Money,
});
export type ModifierOption = z.infer<typeof ModifierOption>;

export const ModifierGroup = z
  .object({
    id: z.string(),
    name: z.string(),
    min: z.number().int().nonnegative(),
    max: z.number().int().positive(),
    options: z.array(ModifierOption).min(1),
  })
  .refine((g) => g.min <= g.max, { message: "min must be <= max" });
export type ModifierGroup = z.infer<typeof ModifierGroup>;

export const ItemRole = z.enum(["main", "side", "drink", "dessert", "other"]);
export type ItemRole = z.infer<typeof ItemRole>;

export const Item = z.object({
  id: z.string(),
  business_id: z.string(),
  category_id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  price: Money,
  modifier_groups: z.array(ModifierGroup).default([]),
  dietary_tags: z.array(DietaryTag).default([]),
  allergens: AllergenMap,
  role: ItemRole.default("other").describe("Used by plan_group_order: a 'main' feeds one person per serving"),
  lead_time_minutes: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("Minimum notice before pickup/delivery, e.g. 2880 for celebration cakes"),
  serves: z.number().int().positive().default(1),
  fulfillment_modes: z
    .array(FulfillmentMode)
    .optional()
    .describe("Restricts the item to these modes; absent means any mode the location offers"),
  location_ids: z.array(z.string()).optional().describe("Absent means every location of the business"),
});
export type Item = z.infer<typeof Item>;

export const StockStatus = z.enum(["in_stock", "low", "sold_out", "unknown"]);
export type StockStatus = z.infer<typeof StockStatus>;

export const Availability = z.object({
  item_id: z.string(),
  location_id: z.string(),
  status: StockStatus,
  quantity: z.number().int().nonnegative().nullable().describe("Units left if the merchant tracks it, else null"),
  orderable: z.boolean().describe("True if the item can be ordered for the requested time"),
  earliest_time: IsoDateTime.nullable().describe("Earliest time this item can be ready, honoring lead time and hours"),
  reason: z.string().optional(),
  stale: z.boolean().describe("True if as_of + ttl_seconds is in the past. Re-check before relying on it."),
  ...Freshness,
});
export type Availability = z.infer<typeof Availability>;

export const MenuItemSummary = Item.extend({ availability: Availability });
export type MenuItemSummary = z.infer<typeof MenuItemSummary>;

export const SelectedModifier = z.object({
  group_id: z.string(),
  option_id: z.string(),
});
export type SelectedModifier = z.infer<typeof SelectedModifier>;

export const OrderLineInput = z.object({
  item_id: z.string(),
  quantity: z.number().int().positive().max(500),
  modifiers: z.array(SelectedModifier).default([]),
  notes: z.string().max(280).optional(),
});
export type OrderLineInput = z.infer<typeof OrderLineInput>;

export const PricedLine = z.object({
  item_id: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  modifiers: z.array(SelectedModifier.extend({ name: z.string(), price_delta: Money })),
  notes: z.string().optional(),
  unit_price: Money,
  line_total: Money,
  serves: z.number().int().positive(),
});
export type PricedLine = z.infer<typeof PricedLine>;

export const Fee = z.object({
  code: z.string(),
  label: z.string(),
  amount: Money,
});
export type Fee = z.infer<typeof Fee>;

export const PolicyViolation = z.object({
  code: z.enum([
    "ORDER_TOTAL_CAP",
    "DAILY_TOTAL_CAP",
    "LOCATION_NOT_ALLOWED",
    "HEADCOUNT_CAP",
    "CURRENCY_MISMATCH",
  ]),
  message: z.string(),
  limit: z.number().optional(),
  actual: z.number().optional(),
});
export type PolicyViolation = z.infer<typeof PolicyViolation>;

export const PolicyCheck = z.object({
  allowed: z.boolean(),
  violations: z.array(PolicyViolation),
});
export type PolicyCheck = z.infer<typeof PolicyCheck>;

export const Quote = z.object({
  quote_id: z.string(),
  location_id: z.string(),
  fulfillment: FulfillmentMode,
  desired_time: IsoDateTime,
  eta: IsoDateTime.describe("When the order is expected to be ready (pickup) or arrive (delivery)"),
  delivery_address: Address.optional(),
  headcount: z.number().int().positive().optional(),
  lines: z.array(PricedLine),
  subtotal: Money,
  fees: z.array(Fee),
  tax: Money,
  total: Money,
  expires_at: IsoDateTime,
  policy: PolicyCheck,
  warnings: z.array(z.string()),
  ...Freshness,
});
export type Quote = z.infer<typeof Quote>;

export const OrderStatusValue = z.enum([
  "received",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "picked_up",
  "cancelled",
]);
export type OrderStatusValue = z.infer<typeof OrderStatusValue>;

export const TimelineEvent = z.object({
  status: OrderStatusValue,
  at: IsoDateTime,
  note: z.string().optional(),
});
export type TimelineEvent = z.infer<typeof TimelineEvent>;

export const CustomerContact = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email().optional(),
    phone: z.string().min(7).max(30).optional(),
    company: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((c) => c.email || c.phone, { message: "Provide at least an email or a phone number" });
export type CustomerContact = z.infer<typeof CustomerContact>;

export const PaymentMethod = z.enum(["pay_at_pickup", "invoice", "payment_link"]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const Payment = z.object({
  method: PaymentMethod,
  url: z.string().url().optional().describe("Merchant-hosted payment page. Card data never passes through MCP."),
  instructions: z.string(),
});
export type Payment = z.infer<typeof Payment>;

export const Order = z.object({
  order_id: z.string(),
  quote_id: z.string(),
  location_id: z.string(),
  status: OrderStatusValue,
  fulfillment: FulfillmentMode,
  eta: IsoDateTime,
  lines: z.array(PricedLine),
  subtotal: Money,
  fees: z.array(Fee),
  tax: Money,
  total: Money,
  customer: z.object({
    name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
    company: z.string().optional(),
    notes: z.string().optional(),
  }),
  delivery_address: Address.optional(),
  payment: Payment,
  dry_run: z.boolean().describe("True means recorded but NOT sent to the merchant's system"),
  created_at: IsoDateTime,
  cancellable_until: IsoDateTime.nullable(),
  timeline: z.array(TimelineEvent),
});
export type Order = z.infer<typeof Order>;

export const MerchantPolicies = z.object({
  cancellation: z.object({
    free_within_minutes: z.number().int().nonnegative().describe("Any order can be cancelled this long after placing"),
    until_minutes_before_ready: z
      .number()
      .int()
      .nonnegative()
      .describe("After that, cancellation is allowed until this many minutes before the ETA"),
    summary: z.string(),
  }),
  refund: z.string(),
  delivery: z.string(),
  payment: z.string(),
});
export type MerchantPolicies = z.infer<typeof MerchantPolicies>;

export const Business = z.object({
  id: z.string(),
  name: z.string(),
  type: BusinessType,
  currency: Currency,
  website: z.string().url().optional(),
  policies: MerchantPolicies,
});
export type Business = z.infer<typeof Business>;

/** What a local-data adapter (file, mock) serves from. */
export const Catalog = z.object({
  businesses: z.array(Business).min(1),
  locations: z.array(Location).min(1),
  categories: z.array(Category),
  items: z.array(Item),
  stock: z
    .array(
      z.object({
        location_id: z.string(),
        item_id: z.string(),
        status: StockStatus,
        quantity: z.number().int().nonnegative().nullable().default(null),
      }),
    )
    .default([]),
  stock_as_of: IsoDateTime.nullable().default(null).describe("null means live (now)"),
  stock_ttl_seconds: z.number().int().nonnegative().default(300),
});
export type Catalog = z.infer<typeof Catalog>;

export const ErrorCode = z.enum([
  "QUOTE_EXPIRED",
  "QUOTE_NOT_FOUND",
  "QUOTE_ALREADY_USED",
  "ITEM_SOLD_OUT",
  "ITEM_NOT_FOUND",
  "ITEM_UNAVAILABLE",
  "INVALID_MODIFIERS",
  "MINIMUM_NOT_MET",
  "OUTSIDE_DELIVERY_ZONE",
  "CLOSED",
  "LEAD_TIME_NOT_MET",
  "POLICY_BLOCKED",
  "PRICE_CHANGED",
  "LOCATION_NOT_FOUND",
  "FULFILLMENT_UNAVAILABLE",
  "ORDER_NOT_FOUND",
  "CANCELLATION_WINDOW_CLOSED",
  "IDEMPOTENCY_KEY_REUSED",
  "INVALID_REQUEST",
  "ADAPTER_ERROR",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ToolError = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    suggested_next_tool: z.string().nullable(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ToolError = z.infer<typeof ToolError>;

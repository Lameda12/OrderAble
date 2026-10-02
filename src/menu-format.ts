import { z } from "zod";
import {
  ALLERGENS,
  Allergen,
  type AllergenMap,
  BusinessType,
  type Catalog,
  Currency,
  DietaryTag,
  FulfillmentMode,
  ItemRole,
  type OpeningHours,
  StockStatus,
  Weekday,
} from "./schema.js";

/**
 * The owner-facing menu.yaml format. It is deliberately friendlier than the canonical
 * model: prices in dollars, hours as "07:00-18:00", lead times like "48h", allergens as
 * two short lists. `normalizeMenu` converts it into a canonical Catalog.
 */

const Dollars = z
  .number()
  .nonnegative()
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Use at most 2 decimal places, e.g. 12.95");

const Duration = z.union([
  z.number().int().nonnegative().describe("minutes"),
  z.string().regex(/^\d+\s*(m|min|h|d)$/i, 'Use minutes or a duration like "90m", "4h", "2d"'),
]);

const HoursRange = z
  .string()
  .regex(
    /^(closed|([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d(\s*,\s*([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d)*)$/,
    'Use "07:00-18:00", "07:00-11:00, 12:00-18:00" or "closed"',
  );

const StockInput = z.union([
  StockStatus,
  z.object({ status: StockStatus, quantity: z.number().int().nonnegative().optional() }),
]);

export const MenuFile = z.object({
  business: z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-_]*$/, "Use lowercase letters, numbers and dashes"),
    name: z.string().min(1),
    type: BusinessType,
    currency: Currency.default("CAD"),
    website: z.string().url().optional(),
    policies: z
      .object({
        cancellation: z
          .object({
            free_within_minutes: z.number().int().nonnegative().default(5),
            until_minutes_before_ready: z.number().int().nonnegative().default(120),
          })
          .default({ free_within_minutes: 5, until_minutes_before_ready: 120 }),
        refund: z.string().default("Contact the store for refunds. Refunds go back to the original payment method."),
        delivery: z.string().optional(),
        payment: z.string().default("Pay at pickup, or on account for business customers."),
      })
      .default({
        cancellation: { free_within_minutes: 5, until_minutes_before_ready: 120 },
        refund: "Contact the store for refunds. Refunds go back to the original payment method.",
        payment: "Pay at pickup, or on account for business customers.",
      }),
  }),
  locations: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9][a-z0-9-_]*$/, "Use lowercase letters, numbers and dashes"),
        name: z.string().min(1),
        address: z.object({
          line1: z.string().min(1),
          line2: z.string().optional(),
          city: z.string().min(1),
          region: z.string().min(1),
          postal_code: z.string().min(1),
          country: z.string().length(2).default("CA"),
          lat: z.number().optional(),
          lng: z.number().optional(),
        }),
        phone: z.string().optional(),
        timezone: z.string().default("America/Halifax"),
        hours: z.partialRecord(Weekday, HoursRange).optional(),
        fulfillment: z.array(FulfillmentMode).min(1).default(["pickup"]),
        delivery: z
          .object({
            radius_km: z.number().positive().optional(),
            postal_codes: z.array(z.string().min(1)).optional(),
            fee: Dollars.default(0),
            minimum: Dollars.optional(),
            minutes: z.number().int().nonnegative().default(30),
          })
          .refine((d) => d.radius_km || d.postal_codes?.length, {
            message: "Set either radius_km or postal_codes so agents know where you deliver",
          })
          .optional(),
        prep_minutes: z.number().int().nonnegative().default(15),
        tax_rate: z.number().min(0).max(30).describe("percent, e.g. 14 for Nova Scotia HST"),
      }),
    )
    .min(1, "Add at least one location"),
  categories: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), description: z.string().optional() })).default([]),
  items: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9][a-z0-9-_]*$/, "Use lowercase letters, numbers and dashes"),
      name: z.string().min(1),
      description: z.string().optional(),
      category: z.string().min(1),
      price: Dollars,
      role: ItemRole.optional(),
      dietary: z.array(DietaryTag).default([]),
      allergens: z
        .object({
          contains: z.array(Allergen).default([]),
          may_contain: z.array(Allergen).default([]),
        })
        .optional(),
      lead_time: Duration.optional(),
      serves: z.number().int().positive().default(1),
      only_for: z.array(FulfillmentMode).optional(),
      locations: z.array(z.string()).optional(),
      modifiers: z
        .array(
          z.object({
            id: z.string().min(1),
            name: z.string().min(1),
            min: z.number().int().nonnegative().default(0),
            max: z.number().int().positive().default(1),
            options: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), price: Dollars.default(0) })).min(1),
          }),
        )
        .default([]),
      stock: StockInput.optional(),
      stock_by_location: z.record(z.string(), StockInput).optional(),
    }),
  ),
  stock_updated_at: z.union([z.string().datetime({ offset: true }), z.literal("live")]).optional(),
  stock_ttl_seconds: z.number().int().nonnegative().default(900),
});
export type MenuFile = z.infer<typeof MenuFile>;
export type MenuFileInput = z.input<typeof MenuFile>;

export const toMinor = (dollars: number) => Math.round(dollars * 100);

export function durationToMinutes(d: number | string | undefined): number {
  if (d === undefined) return 0;
  if (typeof d === "number") return d;
  const m = /^(\d+)\s*(m|min|h|d)$/i.exec(d.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  return unit === "d" ? n * 1440 : unit === "h" ? n * 60 : n;
}

function parseHours(hours: MenuFile["locations"][number]["hours"]): OpeningHours[] {
  if (!hours) return [];
  return Object.entries(hours).flatMap(([day, range]) =>
    !range || range === "closed"
      ? []
      : range.split(",").map((r) => {
          const [open, close] = r.trim().split("-") as [string, string];
          return { day: day as z.infer<typeof Weekday>, open, close };
        }),
  );
}

export function allergenMap(input: { contains: string[]; may_contain: string[] } | undefined): AllergenMap {
  const map = Object.fromEntries(ALLERGENS.map((a) => [a, "unknown"])) as AllergenMap;
  for (const a of input?.may_contain ?? []) map[a as keyof AllergenMap] = "may_contain";
  for (const a of input?.contains ?? []) map[a as keyof AllergenMap] = "contains";
  return map;
}

/** Infer a sensible role from the category name when the owner didn't set one. */
function inferRole(categoryName: string): z.infer<typeof ItemRole> {
  const c = categoryName.toLowerCase();
  if (/(drink|coffee|tea|beverage|espresso)/.test(c)) return "drink";
  if (/(dessert|sweet|cake|cookie|treat)/.test(c)) return "dessert";
  if (/(side|snack)/.test(c)) return "side";
  if (/(sandwich|main|bowl|lunch|entree|entrée|plate|pizza|burger|salad|soup)/.test(c)) return "main";
  return "other";
}

export function normalizeMenu(file: MenuFile): Catalog {
  const b = file.business;
  const currency = b.currency;
  const cat = (id: string) => file.categories.find((c) => c.id === id);
  const stock: Catalog["stock"] = [];

  for (const item of file.items) {
    for (const loc of file.locations) {
      if (item.locations && !item.locations.includes(loc.id)) continue;
      const raw = item.stock_by_location?.[loc.id] ?? item.stock;
      if (raw === undefined) continue;
      const s = typeof raw === "string" ? { status: raw } : raw;
      stock.push({ location_id: loc.id, item_id: item.id, status: s.status, quantity: s.quantity ?? null });
    }
  }

  return {
    businesses: [
      {
        id: b.id,
        name: b.name,
        type: b.type,
        currency,
        ...(b.website ? { website: b.website } : {}),
        policies: {
          cancellation: {
            ...b.policies.cancellation,
            summary: `Free cancellation within ${b.policies.cancellation.free_within_minutes} min of ordering, or up to ${b.policies.cancellation.until_minutes_before_ready} min before the order is due.`,
          },
          refund: b.policies.refund,
          delivery:
            b.policies.delivery ??
            (file.locations
              .filter((l) => l.delivery)
              .map(
                (l) =>
                  `${l.name}: ${l.delivery!.radius_km ? `within ${l.delivery!.radius_km} km` : `postal codes ${l.delivery!.postal_codes!.join(", ")}`}, fee $${l.delivery!.fee.toFixed(2)}${l.delivery!.minimum ? `, minimum $${l.delivery!.minimum.toFixed(2)}` : ""}`,
              )
              .join(". ") || "Pickup only."),
          payment: b.policies.payment,
        },
      },
    ],
    locations: file.locations.map((l) => ({
      id: l.id,
      business_id: b.id,
      business_name: b.name,
      business_type: b.type,
      name: l.name,
      address: l.address,
      ...(l.phone ? { phone: l.phone } : {}),
      timezone: l.timezone,
      hours: parseHours(l.hours),
      fulfillment_modes: l.fulfillment,
      ...(l.delivery
        ? {
            delivery_zone: l.delivery.radius_km
              ? { type: "radius" as const, radius_km: l.delivery.radius_km }
              : { type: "postal_codes" as const, prefixes: l.delivery.postal_codes! },
            delivery_fee: { amount: toMinor(l.delivery.fee), currency },
            ...(l.delivery.minimum ? { min_delivery_subtotal: { amount: toMinor(l.delivery.minimum), currency } } : {}),
          }
        : {}),
      prep_minutes: l.prep_minutes,
      delivery_minutes: l.delivery?.minutes ?? 30,
      tax_rate_bps: Math.round(l.tax_rate * 100),
    })),
    categories: file.categories.map((c) => ({ ...c, business_id: b.id })),
    items: file.items.map((i) => ({
      id: i.id,
      business_id: b.id,
      category_id: i.category,
      name: i.name,
      description: i.description ?? "",
      price: { amount: toMinor(i.price), currency },
      modifier_groups: i.modifiers.map((g) => ({
        id: g.id,
        name: g.name,
        min: g.min,
        max: g.max,
        options: g.options.map((o) => ({ id: o.id, name: o.name, price_delta: { amount: toMinor(o.price), currency } })),
      })),
      dietary_tags: i.dietary,
      allergens: allergenMap(i.allergens),
      role: i.role ?? inferRole(cat(i.category)?.name ?? i.category),
      lead_time_minutes: durationToMinutes(i.lead_time),
      serves: i.serves,
      ...(i.only_for ? { fulfillment_modes: i.only_for } : {}),
      ...(i.locations ? { location_ids: i.locations } : {}),
    })),
    stock,
    stock_as_of: !file.stock_updated_at || file.stock_updated_at === "live" ? null : file.stock_updated_at,
    stock_ttl_seconds: file.stock_ttl_seconds,
  };
}

export function mergeCatalogs(...catalogs: Catalog[]): Catalog {
  return {
    businesses: catalogs.flatMap((c) => c.businesses),
    locations: catalogs.flatMap((c) => c.locations),
    categories: catalogs.flatMap((c) => c.categories),
    items: catalogs.flatMap((c) => c.items),
    stock: catalogs.flatMap((c) => c.stock),
    stock_as_of: catalogs.map((c) => c.stock_as_of).find((x) => x) ?? null,
    stock_ttl_seconds: Math.min(...catalogs.map((c) => c.stock_ttl_seconds)),
  };
}

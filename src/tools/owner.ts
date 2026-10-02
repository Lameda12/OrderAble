import { z } from "zod";
import { getSetup, removeItems, saveBusiness, upsertItems } from "../owner.js";
import { ALLERGENS, BusinessType, DietaryTag, FulfillmentMode, ItemRole, StockStatus, Weekday } from "../schema.js";
import { applyStockMessage } from "../stock-text.js";
import { defineTool, nextStep } from "./define.js";

/*
 * Owner tools. Only registered for an owner connection (`serve --owner`, or the owner token
 * over HTTP), never for customers' agents.
 */

const issues = { issues: z.array(z.string()).describe("Plain-English problems still worth fixing") };

export const ownerGetSetup = defineTool({
  name: "owner_get_setup",
  title: "Get menu setup",
  description: `Owner only. Start here when helping a restaurant, cafe or bakery owner set up or change their Orderable menu.
Returns whether a menu exists, the business and locations, a short list of items, an agent-readiness score out of 100 with the top fixes, and remaining issues.
If there's no menu yet, ask the owner for: business name and type, each location's address, opening hours, sales tax rate, and pickup/delivery; then call owner_save_business. Ask one question at a time and keep it conversational.`,
  input: {},
  output: {
    has_menu: z.boolean(),
    business: z.any(),
    locations: z.array(z.any()),
    items: z.array(z.object({ id: z.string(), name: z.string(), category: z.string(), price: z.number(), stock: z.any(), has_allergen_info: z.boolean() })),
    readiness: z.object({ score: z.number(), top_fixes: z.array(z.string()) }).nullable(),
    ...issues,
    ...nextStep,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: (s) => getSetup(s),
});

export const ownerSaveBusiness = defineTool({
  name: "owner_save_business",
  title: "Save business and locations",
  description: `Owner only. Create or update the business and its locations. Locations are matched by id (derived from the name if you leave it out), so you can add one location without resending the others.
Hours use 24h ranges per day: {"mon": "07:00-18:00", "sun": "closed", "sat": "08:00-11:00, 12:00-16:00"}. tax_rate is a percent (Nova Scotia HST is 14). For delivery give either postal code prefixes (["B3H","B3J"]) or radius_km plus the address's lat/lng, and the fee in dollars.
Use only what the owner told you. If something is missing, ask; don't invent addresses, hours or tax rates. Nothing is saved if it doesn't validate; the error says what to fix.`,
  input: {
    name: z.string().min(1),
    type: BusinessType,
    currency: z.string().length(3).optional().describe("Default CAD"),
    website: z.string().url().optional(),
    locations: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().min(1),
          address: z.object({
            line1: z.string().min(1),
            line2: z.string().optional(),
            city: z.string().min(1),
            region: z.string().min(1).describe("Province or state code, e.g. NS"),
            postal_code: z.string().min(1),
            country: z.string().length(2).optional().describe("Default CA"),
            lat: z.number().optional(),
            lng: z.number().optional(),
          }),
          phone: z.string().optional(),
          timezone: z.string().optional().describe("IANA name, default America/Halifax"),
          hours: z.partialRecord(Weekday, z.string()).optional(),
          fulfillment: z.array(FulfillmentMode).optional().describe("Default pickup"),
          delivery: z
            .object({
              radius_km: z.number().positive().optional(),
              postal_codes: z.array(z.string()).optional(),
              fee: z.number().nonnegative().optional().describe("Dollars"),
              minimum: z.number().nonnegative().optional().describe("Dollars"),
              minutes: z.number().int().positive().optional(),
            })
            .optional(),
          prep_minutes: z.number().int().nonnegative().optional(),
          tax_rate: z.number().min(0).max(30),
        }),
      )
      .min(1),
    cancellation: z
      .object({ free_within_minutes: z.number().int().nonnegative().optional(), until_minutes_before_ready: z.number().int().nonnegative().optional() })
      .optional(),
    refund_policy: z.string().optional(),
  },
  output: { saved: z.boolean(), business_id: z.string(), location_ids: z.array(z.string()), ...issues, ...nextStep },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  run: (s, a) => saveBusiness(s, a),
});

export const ownerUpsertItems = defineTool({
  name: "owner_upsert_items",
  title: "Add or update menu items",
  description: `Owner only. Add new items or change existing ones (matched by id, then by name). Categories are created from their names.
If the owner shares a photo or text of their menu, read every item and send them in batches: name, category, price in dollars as printed, and the description if there is one. For existing items, send only what changed.
Allergens and dietary tags: only include what the owner told you or what the menu itself states. Never infer them from the dish name. Anything left out shows to customers' agents as "unknown", which is the honest answer. After saving, ask the owner about allergens for the items listed in next_step.
Allergen names: ${ALLERGENS.join(", ")}.`,
  input: {
    items: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().min(1),
          category: z.string().min(1).describe("Category name, e.g. Sandwiches"),
          price: z.number().nonnegative().describe("Dollars, e.g. 12.95"),
          description: z.string().optional(),
          dietary: z.array(DietaryTag).optional(),
          allergens: z
            .object({
              contains: z.array(z.enum(ALLERGENS)).optional(),
              may_contain: z.array(z.enum(ALLERGENS)).optional(),
            })
            .optional(),
          modifiers: z
            .array(
              z.object({
                name: z.string().describe("e.g. Size, Milk"),
                min: z.number().int().nonnegative().optional().describe("1 means the customer must choose"),
                max: z.number().int().positive().optional(),
                options: z.array(z.object({ name: z.string(), price: z.number().optional().describe("Extra dollars") })).min(1),
              }),
            )
            .optional(),
          stock: StockStatus.optional(),
          quantity: z.number().int().nonnegative().optional(),
          lead_time: z.string().optional().describe('Notice needed, e.g. "48h" for custom cakes'),
          serves: z.number().int().positive().optional(),
          role: ItemRole.optional().describe("main, side, drink, dessert or other; used for group orders"),
          only_for: z.array(FulfillmentMode).optional(),
          locations: z.array(z.string()).optional().describe("Location ids, if not sold everywhere"),
        }),
      )
      .min(1)
      .max(200),
  },
  output: { saved: z.number().int(), created: z.array(z.string()), updated: z.array(z.string()), ...issues, ...nextStep },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  run: (s, a) => upsertItems(s, a),
});

export const ownerRemoveItems = defineTool({
  name: "owner_remove_items",
  title: "Remove menu items",
  description: "Owner only. Remove items from the menu by id (get ids from owner_get_setup). Confirm with the owner before removing. To mark something temporarily unavailable, use owner_update_stock instead.",
  input: { item_ids: z.array(z.string()).min(1) },
  output: { removed: z.number().int(), ...issues, ...nextStep },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  run: (s, a) => removeItems(s, a),
});

export const ownerUpdateStock = defineTool({
  name: "owner_update_stock",
  title: "Update stock",
  description: `Owner only. Change stock in plain words, exactly as the owner says it: "out of butter croissants", "6 morning buns left", "sourdough is back", "86 the soup at Quinpool". If the words match more than one item nothing changes and the message asks which one; pass the owner's answer back with the full item name.`,
  input: { message: z.string().min(1) },
  output: {
    changed: z.boolean(),
    message: z.string(),
    changes: z.array(z.object({ location_id: z.string(), item_id: z.string(), status: StockStatus, quantity: z.number().nullable() })),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  run: async (s, a) => {
    const r = await applyStockMessage(s.adapter, a.message);
    return {
      changed: r.changes.length > 0,
      message: r.handled ? r.message : 'That isn\'t a stock update. Try "out of <item>", "<n> <item> left" or "<item> is back".',
      changes: r.changes,
    };
  },
});

export const ownerTools = [ownerGetSetup, ownerSaveBusiness, ownerUpsertItems, ownerRemoveItems, ownerUpdateStock] as const;

import { z } from "zod";
import { Allergen, Availability, DietaryTag, Freshness, FulfillmentMode, IsoDateTime, ItemRole, ModifierGroup, Money } from "../schema.js";
import { defineTool, nextStep } from "./define.js";

export const searchMenu = defineTool({
  name: "search_menu",
  title: "Search menu",
  description: `Find items at one location, with live availability. Use after list_locations.
Filters: free-text \`query\` (matches name, description, category), \`dietary\` tags (all must match; vegan counts as vegetarian and dairy_free), \`exclude_allergens\` (drops items that contain or may contain them; items where the merchant has not stated the allergen are kept but carry allergen_warning, never treat those as safe), \`max_price\` in minor units, \`category\`.
By default only items orderable now (or at desired_time) are returned; set include_unavailable to see sold-out items too.
Each result includes price (minor units), allergens, lead_time_minutes, serves, modifier groups (ids needed for quote_order), and availability with as_of/ttl_seconds.
Next: get_item for full detail, or quote_order.`,
  input: {
    location_id: z.string(),
    query: z.string().optional(),
    dietary: z.array(DietaryTag).optional(),
    exclude_allergens: z.array(Allergen).optional(),
    max_price: z.number().int().nonnegative().optional().describe("Minor units, e.g. 1500 = $15.00"),
    category: z.string().optional().describe("Category id or name"),
    fulfillment: FulfillmentMode.optional(),
    desired_time: IsoDateTime.optional().describe("Check orderability for this time instead of now"),
    include_unavailable: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  output: {
    location_id: z.string(),
    location_name: z.string(),
    total_matches: z.number().int(),
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        category: z.string(),
        price: Money,
        price_display: z.string(),
        role: ItemRole,
        serves: z.number().int(),
        lead_time_minutes: z.number().int(),
        dietary_tags: z.array(DietaryTag),
        allergens_contains: z.array(Allergen),
        allergens_may_contain: z.array(Allergen),
        allergens_unknown: z.array(Allergen),
        allergen_warning: z.string().optional(),
        modifier_groups: z.array(ModifierGroup),
        availability: Availability,
      }),
    ),
    ...Freshness,
    ...nextStep,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: (s, a) => s.searchMenu(a),
});

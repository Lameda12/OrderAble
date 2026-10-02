import { z } from "zod";
import { Availability, Freshness, Item } from "../schema.js";
import { defineTool, nextStep } from "./define.js";

export const getItem = defineTool({
  name: "get_item",
  title: "Get item",
  description: `Full detail for one item: description, price, every modifier group with option ids and min/max, dietary tags, and the complete allergen map (contains | may_contain | unknown for each major allergen; unknown means the merchant has not said, so never treat it as safe), lead time, serves, plus availability at each location that sells it.
Use before quoting anything with modifiers or when a customer has allergies. Next: quote_order.`,
  input: { item_id: z.string() },
  output: {
    item: Item,
    price_display: z.string(),
    allergen_summary: z.string(),
    required_modifier_groups: z.array(z.string()).describe("Group ids that need at least one option in quote_order"),
    availability: z.array(Availability),
    ...Freshness,
    ...nextStep,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: (s, a) => s.getItem(a.item_id),
});

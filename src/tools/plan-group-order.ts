import { z } from "zod";
import { Allergen, DietaryTag, Freshness, FulfillmentMode, IsoDateTime, Money, OrderLineInput } from "../schema.js";
import { defineTool, nextStep } from "./define.js";

export const planGroupOrder = defineTool({
  name: "plan_group_order",
  title: "Plan group order",
  description: `Propose a cart that feeds a group: team lunch, catering, an offsite. Deterministic, no LLM inside.
Give headcount, budget_per_person (minor units, ALL-IN: tax and fees included), dietary_requirements as counts (e.g. {"vegetarian": 3, "gluten_free": 1}; each count is treated as different people), and desired_time.
It covers each dietary group with individual portions first, fills the rest with up to three mains for variety, then adds drinks (and dessert if asked) only if the budget allows.
Returns \`lines\` ready to pass to quote_order unchanged, a per-line breakdown of who each item covers, an estimate with per-person cost, a coverage report, any unmet constraints, and warnings (e.g. shared-kitchen gluten risk).
Next: show the plan to the customer, then quote_order with the same lines.`,
  input: {
    location_id: z.string(),
    headcount: z.number().int().min(1).max(500),
    budget_per_person: z.number().int().positive().describe("Minor units, all-in. 2000 = $20.00"),
    dietary_requirements: z.partialRecord(DietaryTag, z.number().int().nonnegative()).optional(),
    avoid_allergens: z.array(Allergen).optional().describe("Excluded for everyone, including items with unknown status"),
    desired_time: IsoDateTime,
    fulfillment: FulfillmentMode.optional().describe("Default pickup"),
    extras: z.array(z.enum(["drinks", "dessert"])).optional().describe('Default ["drinks"]'),
  },
  output: {
    location_id: z.string(),
    location_name: z.string(),
    headcount: z.number().int(),
    desired_time: IsoDateTime,
    ready_time: IsoDateTime,
    fulfillment: FulfillmentMode,
    lines: z.array(OrderLineInput),
    line_details: z.array(
      z.object({
        item_id: z.string(),
        name: z.string(),
        quantity: z.number().int(),
        serves: z.number().int(),
        covers: z.array(z.string()),
        unit_price: Money,
        line_total: Money,
      }),
    ),
    estimate: z
      .object({
        subtotal: Money,
        fees: z.array(z.object({ code: z.string(), label: z.string(), amount: Money })),
        tax: Money,
        total: Money,
        budget_total: Money,
        per_person: Money,
        within_budget: z.boolean(),
      })
      .nullable(),
    coverage: z.object({
      people_with_a_main: z.number().int(),
      headcount: z.number().int(),
      dietary: z.array(
        z.object({ requirement: DietaryTag, needed: z.number().int(), covered: z.number().int(), items: z.array(z.string()) }),
      ),
      fully_covered: z.boolean(),
    }),
    unmet: z.array(z.object({ constraint: z.string(), reason: z.string() })),
    warnings: z.array(z.string()),
    ...Freshness,
    ...nextStep,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: (s, a) => s.planGroupOrder(a),
});

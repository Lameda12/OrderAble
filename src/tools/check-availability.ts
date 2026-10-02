import { z } from "zod";
import { Availability, Freshness, FulfillmentMode, IsoDateTime } from "../schema.js";
import { defineTool, nextStep } from "./define.js";

export const checkAvailability = defineTool({
  name: "check_availability",
  title: "Check availability",
  description: `Check whether specific items can be ordered at a location for a given time. Honors stock (in_stock | low | sold_out | unknown, with quantity when tracked), item lead times (e.g. cakes need 48h), opening hours, and fulfillment mode.
Returns per-item orderable, earliest_time, a reason when not orderable, and stale=true if the merchant's stock data has outlived its ttl.
Use before quote_order for pre-orders, catering, or anything with a future desired_time. Next: quote_order, or search_menu for substitutes.`,
  input: {
    location_id: z.string(),
    item_ids: z.array(z.string()).min(1).max(100),
    desired_time: IsoDateTime.optional().describe("When the order should be ready (pickup) or arrive (delivery). Omit for ASAP."),
    fulfillment: FulfillmentMode.optional(),
    quantities: z.record(z.string(), z.number().int().positive()).optional().describe("item_id → quantity wanted"),
  },
  output: {
    location_id: z.string(),
    desired_time: IsoDateTime.nullable(),
    open_at_desired_time: z.boolean(),
    all_orderable: z.boolean(),
    availability: z.array(Availability),
    ...Freshness,
    ...nextStep,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: (s, a) => s.checkAvailability(a),
});

import { z } from "zod";
import { Address, FulfillmentMode, IsoDateTime, OrderLineInput, Quote } from "../schema.js";
import { defineTool, nextStep } from "./define.js";

export const quoteOrder = defineTool({
  name: "quote_order",
  title: "Quote order",
  description: `Price a cart and lock it for 10 minutes. Required before place_order: there is no way to order without a quote.
Validates everything an order can fail on: opening hours (CLOSED), delivery zone (OUTSIDE_DELIVERY_ZONE), stock (ITEM_SOLD_OUT), lead times (LEAD_TIME_NOT_MET), modifiers (INVALID_MODIFIERS), delivery minimum (MINIMUM_NOT_MET). Errors include suggested_next_tool and details such as earliest_time.
Returns quote_id, itemized lines, subtotal, fees, tax, total (minor units), eta, expires_at, and a policy check. If policy.allowed is false, place_order will refuse; tell the customer why.
Next: confirm the total with the customer, then place_order.`,
  input: {
    location_id: z.string(),
    lines: z.array(OrderLineInput).min(1).max(100),
    fulfillment: FulfillmentMode,
    desired_time: IsoDateTime.optional().describe("Ready time for pickup, arrival time for delivery. Omit for ASAP."),
    delivery_address: Address.optional().describe("Required for delivery. Include lat/lng for radius-based zones."),
    headcount: z.number().int().positive().optional().describe("For catering/group orders; checked against policy"),
  },
  output: { ...Quote.shape, ...nextStep },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  run: (s, a) => s.quoteOrder(a),
});

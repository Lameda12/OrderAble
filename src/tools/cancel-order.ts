import { z } from "zod";
import { TimelineEvent } from "../schema.js";
import { defineTool } from "./define.js";

export const cancelOrder = defineTool({
  name: "cancel_order",
  title: "Cancel order",
  description: `Cancel an order within the merchant's cancellation window (see cancellable_until on the order, or orderable://policies).
Fails with CANCELLATION_WINDOW_CLOSED once the window has passed or the order is ready/out for delivery; details include the store phone number so a human can call.
Cancelling an already-cancelled order succeeds again (idempotent). Only cancel when the customer asked to.`,
  input: { order_id: z.string(), reason: z.string().min(1).max(280) },
  output: {
    order_id: z.string(),
    cancelled: z.boolean(),
    status: z.literal("cancelled"),
    message: z.string(),
    timeline: z.array(TimelineEvent),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  run: (s, a) => s.cancelOrder(a.order_id, a.reason),
});

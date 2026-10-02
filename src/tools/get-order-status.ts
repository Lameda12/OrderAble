import { z } from "zod";
import { Freshness, IsoDateTime, Money, OrderStatusValue, TimelineEvent } from "../schema.js";
import { defineTool, nextStep } from "./define.js";

export const getOrderStatus = defineTool({
  name: "get_order_status",
  title: "Get order status",
  description: `Track an order. Returns the current status (received, accepted, preparing, ready, out_for_delivery, delivered, picked_up, cancelled), a timestamped timeline, eta, and until when it can be cancelled.
ttl_seconds says how long before checking again is useful. DRY_RUN orders stay "received" because they were never sent.`,
  input: { order_id: z.string() },
  output: {
    order_id: z.string(),
    status: OrderStatusValue,
    eta: IsoDateTime,
    dry_run: z.boolean(),
    timeline: z.array(TimelineEvent),
    cancellable_until: IsoDateTime.nullable(),
    total: Money,
    ...Freshness,
    ...nextStep,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  run: (s, a) => s.getOrderStatus(a.order_id),
});

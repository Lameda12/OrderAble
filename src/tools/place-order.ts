import { z } from "zod";
import { CustomerContact, Order, PaymentMethod } from "../schema.js";
import { defineTool, nextStep } from "./define.js";

export const placeOrder = defineTool({
  name: "place_order",
  title: "Place order",
  description: `Turn a quote into a real order. Only call after the customer has seen the quote total and said yes.
Requires an unexpired quote_id, a unique idempotency_key you generate (e.g. a UUID), customer contact (name plus email or phone), and confirm: true.
Retrying with the same idempotency_key and quote returns the original order (idempotent_replay: true), never a duplicate. Safe to retry on timeouts.
Fails with QUOTE_EXPIRED, QUOTE_ALREADY_USED, PRICE_CHANGED or ITEM_SOLD_OUT (re-quote), or POLICY_BLOCKED (spending policy; do not work around it).
No card data is ever taken here: payment is at pickup, on invoice, or via a merchant-hosted link in order.payment.
If order.dry_run is true, the order was recorded but NOT sent to the merchant; say so.
Next: get_order_status.`,
  input: {
    quote_id: z.string(),
    idempotency_key: z.string().min(8).max(128),
    customer: CustomerContact,
    confirm: z.literal(true).describe("Must be true: the customer approved this exact total"),
    payment_method: PaymentMethod.optional().describe("Defaults to the merchant's first accepted method"),
  },
  output: { order: Order, idempotent_replay: z.boolean(), ...nextStep },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  run: (s, a) => s.placeOrder(a),
});

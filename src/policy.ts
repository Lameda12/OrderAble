import { z } from "zod";
import type { PolicyCheck, PolicyViolation } from "./schema.js";
import { localParts } from "./time.js";

/**
 * Agent spending policy, set in orderable.config.yaml. Amounts are dollars in the file
 * (owner-friendly) and minor units everywhere else.
 */
export const SpendingPolicyInput = z.object({
  timezone: z.string().default("America/Halifax").describe("Which calendar day counts toward the daily cap"),
  max_order_total: z.number().positive().optional().describe("Dollars, including tax and fees"),
  max_daily_total: z.number().positive().optional().describe("Dollars across all agent orders per day"),
  allowed_location_ids: z.array(z.string()).default([]).describe("Empty means every location"),
  max_headcount: z.number().int().positive().optional(),
});
export type SpendingPolicyInput = z.input<typeof SpendingPolicyInput>;

export interface SpendingPolicy {
  timezone: string;
  max_order_total_minor: number | null;
  max_daily_total_minor: number | null;
  allowed_location_ids: string[];
  max_headcount: number | null;
}

export function resolvePolicy(input: SpendingPolicyInput = {}): SpendingPolicy {
  const p = SpendingPolicyInput.parse(input);
  return {
    timezone: p.timezone,
    max_order_total_minor: p.max_order_total != null ? Math.round(p.max_order_total * 100) : null,
    max_daily_total_minor: p.max_daily_total != null ? Math.round(p.max_daily_total * 100) : null,
    allowed_location_ids: p.allowed_location_ids,
    max_headcount: p.max_headcount ?? null,
  };
}

export interface PolicyContext {
  location_id: string;
  total_minor: number;
  headcount?: number | undefined;
  spent_today_minor: number;
}

export function evaluatePolicy(policy: SpendingPolicy, ctx: PolicyContext): PolicyCheck {
  const violations: PolicyViolation[] = [];
  const dollars = (m: number) => `$${(m / 100).toFixed(2)}`;

  if (policy.allowed_location_ids.length && !policy.allowed_location_ids.includes(ctx.location_id))
    violations.push({
      code: "LOCATION_NOT_ALLOWED",
      message: `Agents may only order from: ${policy.allowed_location_ids.join(", ")}`,
    });

  if (policy.max_order_total_minor != null && ctx.total_minor > policy.max_order_total_minor)
    violations.push({
      code: "ORDER_TOTAL_CAP",
      message: `Order total ${dollars(ctx.total_minor)} exceeds the per-order cap of ${dollars(policy.max_order_total_minor)}`,
      limit: policy.max_order_total_minor,
      actual: ctx.total_minor,
    });

  if (policy.max_daily_total_minor != null && ctx.spent_today_minor + ctx.total_minor > policy.max_daily_total_minor)
    violations.push({
      code: "DAILY_TOTAL_CAP",
      message: `This order would bring today's agent spend to ${dollars(ctx.spent_today_minor + ctx.total_minor)}, over the daily cap of ${dollars(policy.max_daily_total_minor)}`,
      limit: policy.max_daily_total_minor,
      actual: ctx.spent_today_minor + ctx.total_minor,
    });

  if (policy.max_headcount != null && ctx.headcount != null && ctx.headcount > policy.max_headcount)
    violations.push({
      code: "HEADCOUNT_CAP",
      message: `Headcount ${ctx.headcount} exceeds the cap of ${policy.max_headcount}`,
      limit: policy.max_headcount,
      actual: ctx.headcount,
    });

  return { allowed: violations.length === 0, violations };
}

/** Sum of non-cancelled order totals created on the same local calendar day as `now`. */
export function spentOnDay(orders: { created_at: string; status: string; total: { amount: number } }[], now: Date, tz: string) {
  const today = localParts(now, tz).date;
  return orders
    .filter((o) => o.status !== "cancelled" && localParts(new Date(o.created_at), tz).date === today)
    .reduce((s, o) => s + o.total.amount, 0);
}

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { PaymentMethod } from "./schema.js";
import { type SpendingPolicy, SpendingPolicyInput, resolvePolicy } from "./policy.js";

export const ConfigFile = z.object({
  adapter: z.enum(["file", "mock", "square"]).default("file"),
  menu: z.string().default("./menu.yaml"),
  database: z.string().default("./orderable.db"),
  dry_run: z.boolean().default(true),
  quote_ttl_seconds: z.number().int().min(60).max(3600).default(600),
  payment: z
    .object({
      methods: z.array(PaymentMethod).min(1).default(["pay_at_pickup"]),
      payment_link_template: z
        .string()
        .url()
        .optional()
        .describe("Merchant-hosted checkout URL. {order_id} and {total} are substituted."),
      invoice_terms: z.string().default("Net 30"),
    })
    .default({ methods: ["pay_at_pickup"], invoice_terms: "Net 30" }),
  policy: SpendingPolicyInput.default({ timezone: "America/Halifax", allowed_location_ids: [] }),
  http: z.object({ port: z.number().int().default(3333), host: z.string().default("127.0.0.1") }).default({ port: 3333, host: "127.0.0.1" }),
});
export type ConfigFile = z.infer<typeof ConfigFile>;

export interface OrderableConfig {
  adapter: ConfigFile["adapter"];
  menu: string;
  database: string;
  dry_run: boolean;
  quote_ttl_seconds: number;
  payment: ConfigFile["payment"];
  policy: SpendingPolicy;
  http: ConfigFile["http"];
}

const truthy = (v: string | undefined) => (v === undefined ? undefined : !/^(0|false|no|off)$/i.test(v.trim()));

/**
 * Load orderable.config.yaml (if present), then apply env overrides.
 * DRY_RUN defaults to true: orders are recorded but never sent to the merchant's system.
 */
export function loadConfig(path = "orderable.config.yaml", overrides: Partial<ConfigFile> = {}): OrderableConfig {
  const abs = resolve(path);
  const raw = existsSync(abs) ? (parse(readFileSync(abs, "utf8")) ?? {}) : {};
  const file = ConfigFile.parse({ ...raw, ...overrides });
  const envDry = truthy(process.env.DRY_RUN);
  return {
    adapter: (process.env.ORDERABLE_ADAPTER as ConfigFile["adapter"]) ?? file.adapter,
    menu: process.env.ORDERABLE_MENU ?? file.menu,
    database: process.env.ORDERABLE_DB ?? file.database,
    dry_run: envDry ?? file.dry_run,
    quote_ttl_seconds: file.quote_ttl_seconds,
    payment: file.payment,
    policy: resolvePolicy(file.policy),
    http: file.http,
  };
}

export function defaultConfig(overrides: Partial<OrderableConfig> = {}): OrderableConfig {
  return {
    adapter: "mock",
    menu: "./menu.yaml",
    database: ":memory:",
    dry_run: true,
    quote_ttl_seconds: 600,
    payment: { methods: ["pay_at_pickup", "invoice"], invoice_terms: "Net 30" },
    policy: resolvePolicy({}),
    http: { port: 3333, host: "127.0.0.1" },
    ...overrides,
  };
}

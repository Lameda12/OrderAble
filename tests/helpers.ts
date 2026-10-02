import { MockAdapter } from "../src/adapters/mock.js";
import { defaultConfig, type OrderableConfig } from "../src/config.js";
import { resolvePolicy, type SpendingPolicyInput } from "../src/policy.js";
import { OrderableService } from "../src/service.js";
import { SqliteStore } from "../src/store.js";

/** Wednesday 2026-10-07 10:00 in Halifax (ADT, UTC-3). Both businesses are open. */
export const WED_10AM = "2026-10-07T13:00:00Z";
export const WED_NOON = "2026-10-07T15:00:00Z";

export function setup(opts: { policy?: SpendingPolicyInput; config?: Partial<OrderableConfig>; at?: string } = {}) {
  const clock = { t: new Date(opts.at ?? WED_10AM).getTime() };
  const now = () => new Date(clock.t);
  const adapter = new MockAdapter({ now });
  const store = new SqliteStore(":memory:");
  const config = defaultConfig({ policy: resolvePolicy(opts.policy ?? {}), ...opts.config });
  const service = new OrderableService({ adapter, store, config, now });
  return {
    adapter,
    store,
    service,
    now,
    advance: (minutes: number) => {
      clock.t += minutes * 60_000;
    },
  };
}

export const customer = { name: "Priya Shah", email: "priya@example.com", company: "Harbourline Labs" };

export const officeAddress = {
  line1: "1801 Hollis St",
  city: "Halifax",
  region: "NS",
  postal_code: "B3J 3N4",
  country: "CA",
  lat: 44.6488,
  lng: -63.5752,
};

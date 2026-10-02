import type { Adapter } from "./adapters/types.js";
import type { OrderableConfig } from "./config.js";
import { OrderableService, allergenLists } from "./service.js";
import { MemoryStore } from "./store-memory.js";
import { addMinutes, nextOpenAt } from "./time.js";

export interface DoctorCheck {
  id: string;
  label: string;
  points: number;
  max: number;
  detail: string;
  fix: string | null;
}

export interface DoctorReport {
  score: number;
  checks: DoctorCheck[];
  top_fixes: string[];
}

const pct = (n: number, d: number) => (d === 0 ? 1 : n / d);

/** Agent-readiness score out of 100: what an agent checks before trusting a merchant. */
export async function runDoctor(adapter: Adapter, config: OrderableConfig, now = new Date()): Promise<DoctorReport> {
  const locations = await adapter.listLocations();
  const menus = await Promise.all(locations.map((l) => adapter.getMenu(l.id)));
  const items = [...new Map(menus.flatMap((m) => m.items).map((i) => [i.id, i])).values()];
  const stock = (await Promise.all(locations.map((l, i) => adapter.getAvailability(l.id, menus[i]!.items.map((x) => x.id))))).flat();
  const checks: DoctorCheck[] = [];
  const add = (c: Omit<DoctorCheck, "points"> & { ratio: number }) =>
    checks.push({ id: c.id, label: c.label, max: c.max, points: Math.round(c.ratio * c.max), detail: c.detail, fix: c.ratio < 1 ? c.fix : null });

  const noAllergens = items.filter((i) => allergenLists(i).unknown.length === 12);
  add({
    id: "allergens",
    label: "Allergen coverage",
    max: 25,
    ratio: pct(items.length - noAllergens.length, items.length),
    detail: `${items.length - noAllergens.length}/${items.length} items declare allergens`,
    fix: `Add allergens to ${noAllergens.slice(0, 3).map((i) => i.name).join(", ")}${noAllergens.length > 3 ? ` and ${noAllergens.length - 3} more` : ""}. Agents treat missing allergen info as unknown and skip the item for anyone with allergies.`,
  });

  const tracked = new Set(stock.filter((s) => s.status !== "unknown").map((s) => s.item_id));
  const untracked = items.filter((i) => !tracked.has(i.id));
  add({
    id: "stock",
    label: "Stock tracked",
    max: 15,
    ratio: pct(tracked.size, items.length),
    detail: `${tracked.size}/${items.length} items have a stock status`,
    fix: `Set stock for ${untracked.slice(0, 3).map((i) => i.name).join(", ")}${untracked.length > 3 ? ` and ${untracked.length - 3} more` : ""} (in_stock, low, sold_out). Unknown availability makes agents pick someone else.`,
  });

  const stale = menus.filter((m) => new Date(m.as_of).getTime() + m.ttl_seconds * 1000 < now.getTime());
  add({
    id: "freshness",
    label: "Availability freshness",
    max: 10,
    ratio: pct(menus.length - stale.length, menus.length),
    detail: stale.length ? `Stock data is stale (as of ${stale[0]!.as_of}, ttl ${stale[0]!.ttl_seconds}s)` : "Stock data is fresh",
    fix: 'Update stock_updated_at in menu.yaml when you restock (or set it to "live" if a system keeps stock current).',
  });

  const noHours = locations.filter((l) => l.hours.length === 0);
  add({
    id: "hours",
    label: "Opening hours",
    max: 15,
    ratio: pct(locations.length - noHours.length, locations.length),
    detail: `${locations.length - noHours.length}/${locations.length} locations have hours`,
    fix: `Add hours for ${noHours.map((l) => l.name).join(", ")}. Without them agents can't schedule pickups.`,
  });

  const delivering = locations.filter((l) => l.fulfillment_modes.includes("delivery"));
  const noZone = delivering.filter((l) => !l.delivery_zone || (l.delivery_zone.type === "radius" && l.address.lat == null));
  add({
    id: "zones",
    label: "Delivery zones",
    max: 10,
    ratio: pct(delivering.length - noZone.length, delivering.length),
    detail: delivering.length ? `${delivering.length - noZone.length}/${delivering.length} delivery locations have a checkable zone` : "No delivery offered",
    fix: `Define a delivery zone for ${noZone.map((l) => l.name).join(", ")} (postal_codes, or radius_km plus lat/lng on the address).`,
  });

  // End-to-end: can an agent actually get from quote to order? Uses a throwaway store, dry run.
  let flowOk = false;
  let flowDetail = "No orderable item found";
  try {
    const service = new OrderableService({ adapter, store: new MemoryStore(), config: { ...config, dry_run: true }, now: () => now });
    outer: for (const loc of locations) {
      const mode = loc.fulfillment_modes.find((m) => m === "pickup") ?? loc.fulfillment_modes[0]!;
      const open = nextOpenAt(loc, addMinutes(now, loc.prep_minutes + 60));
      if (!open) continue;
      const when = addMinutes(open, 60).toISOString();
      const menu = await service.searchMenu({ location_id: loc.id, desired_time: when, fulfillment: mode });
      for (const item of menu.items.filter((i) => i.modifier_groups.every((g) => g.min === 0)).slice(0, 3)) {
        try {
          // Delivery-only merchants: test with an address inside their own zone, and meet the minimum.
          const zone = loc.delivery_zone;
          const address =
            mode === "delivery"
              ? {
                  ...loc.address,
                  ...(zone?.type === "postal_codes" ? { postal_code: `${zone.prefixes[0]} 0A0` } : {}),
                }
              : undefined;
          const min = mode === "delivery" ? (loc.min_delivery_subtotal?.amount ?? 0) : 0;
          const quantity = Math.max(1, Math.ceil(min / Math.max(1, item.price.amount)));
          const q = await service.quoteOrder({
            location_id: loc.id,
            lines: [{ item_id: item.id, quantity, modifiers: [] }],
            fulfillment: mode,
            desired_time: when,
            ...(address ? { delivery_address: address } : {}),
          });
          const { order } = await service.placeOrder({
            quote_id: q.quote_id,
            idempotency_key: `doctor-${q.quote_id}`,
            customer: { name: "Orderable Doctor", email: "doctor@example.com" },
            confirm: true,
          });
          await service.getOrderStatus(order.order_id);
          flowOk = true;
          flowDetail = `Quoted and placed a dry-run order for ${item.name} at ${loc.name}`;
          break outer;
        } catch (e) {
          flowDetail = `Quote/order failed for ${item.name}: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    }
  } catch (e) {
    flowDetail = e instanceof Error ? e.message : String(e);
  }
  add({
    id: "flow",
    label: "Quote-to-order flow",
    max: 20,
    ratio: flowOk ? 1 : 0,
    detail: flowDetail,
    fix: `Fix the order flow: ${flowDetail}. Run \`orderable validate\` first.`,
  });

  const noDesc = items.filter((i) => !i.description.trim());
  add({
    id: "descriptions",
    label: "Item descriptions",
    max: 5,
    ratio: pct(items.length - noDesc.length, items.length),
    detail: `${items.length - noDesc.length}/${items.length} items have a description`,
    fix: `Describe ${noDesc.slice(0, 3).map((i) => i.name).join(", ")}${noDesc.length > 3 ? ` and ${noDesc.length - 3} more` : ""}. Agents match on descriptions when customers ask for "something light" or "spicy".`,
  });

  const score = checks.reduce((s, c) => s + c.points, 0);
  const top_fixes = [...checks]
    .filter((c) => c.fix)
    .sort((a, b) => b.max - b.points - (a.max - a.points))
    .slice(0, 3)
    .map((c) => `${c.fix} (+${c.max - c.points})`);
  return { score, checks, top_fixes };
}

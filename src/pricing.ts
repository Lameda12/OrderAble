import { OrderableError } from "./errors.js";
import type { Fee, Item, Location, Money, OrderLineInput, PricedLine, SelectedModifier } from "./schema.js";

export const money = (amount: number, currency: string): Money => ({ amount: Math.round(amount), currency });

export const formatMoney = (m: Money) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: m.currency }).format(m.amount / 100);

/** Validate selected modifiers against an item's groups. Throws INVALID_MODIFIERS with specifics. */
export function resolveModifiers(item: Item, selected: SelectedModifier[]) {
  const problems: string[] = [];
  const resolved: PricedLine["modifiers"] = [];
  const seen = new Set<string>();

  for (const sel of selected) {
    const group = item.modifier_groups.find((g) => g.id === sel.group_id);
    const option = group?.options.find((o) => o.id === sel.option_id);
    if (!group) problems.push(`"${item.name}" has no modifier group "${sel.group_id}"`);
    else if (!option) problems.push(`Group "${group.name}" has no option "${sel.option_id}"`);
    else if (seen.has(`${group.id}/${option.id}`)) problems.push(`Option "${option.name}" selected twice`);
    else {
      seen.add(`${group.id}/${option.id}`);
      resolved.push({ ...sel, name: `${group.name}: ${option.name}`, price_delta: option.price_delta });
    }
  }

  for (const group of item.modifier_groups) {
    const count = selected.filter((s) => s.group_id === group.id).length;
    if (count < group.min)
      problems.push(
        `"${group.name}" needs at least ${group.min} selection(s). Options: ${group.options.map((o) => o.id).join(", ")}`,
      );
    if (count > group.max) problems.push(`"${group.name}" allows at most ${group.max} selection(s)`);
  }

  if (problems.length)
    throw new OrderableError("INVALID_MODIFIERS", problems.join("; "), "get_item", {
      item_id: item.id,
      problems,
    });
  return resolved;
}

/** Defaults the required single-choice groups to their first option. Used by the group planner. */
export function defaultModifiers(item: Item): SelectedModifier[] {
  return item.modifier_groups.flatMap((g) =>
    g.options.slice(0, g.min).map((o) => ({ group_id: g.id, option_id: o.id })),
  );
}

export function priceLine(item: Item, line: OrderLineInput): PricedLine {
  const modifiers = resolveModifiers(item, line.modifiers);
  const unit = item.price.amount + modifiers.reduce((s, m) => s + m.price_delta.amount, 0);
  return {
    item_id: item.id,
    name: item.name,
    quantity: line.quantity,
    modifiers,
    ...(line.notes ? { notes: line.notes } : {}),
    unit_price: money(unit, item.price.currency),
    line_total: money(unit * line.quantity, item.price.currency),
    serves: item.serves,
  };
}

export function computeTotals(location: Location, lines: PricedLine[], fulfillment: string, currency: string) {
  const subtotal = money(lines.reduce((s, l) => s + l.line_total.amount, 0), currency);
  const fees: Fee[] = [];
  if (fulfillment === "delivery" && location.delivery_fee)
    fees.push({ code: "delivery", label: "Delivery fee", amount: location.delivery_fee });
  // Tax applies to goods and fees (HST in Nova Scotia does). Rounded half-up per order.
  const taxable = subtotal.amount + fees.reduce((s, f) => s + f.amount.amount, 0);
  const tax = money((taxable * location.tax_rate_bps) / 10_000, currency);
  const total = money(taxable + tax.amount, currency);
  return { subtotal, fees, tax, total };
}

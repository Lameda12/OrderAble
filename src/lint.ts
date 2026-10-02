import { LineCounter, parseDocument } from "yaml";
import { parseMenuYaml } from "./adapters/file.js";
import type { MenuFile } from "./menu-format.js";

export interface LintFinding {
  severity: "error" | "warning";
  line: number | null;
  message: string;
}

/** Turn a Zod path into plain English using names from the raw document where possible. */
function describePath(raw: unknown, path: string): string {
  const parts = path.split(".").filter(Boolean);
  const r = raw as Record<string, unknown> | undefined;
  if (parts[0] === "items" && parts[1] !== undefined) {
    const item = (r?.items as Record<string, unknown>[] | undefined)?.[Number(parts[1])];
    const name = (item?.name as string) ?? `Item #${Number(parts[1]) + 1}`;
    return parts.length > 2 ? `${name} → ${parts.slice(2).join(" ")}` : name;
  }
  if (parts[0] === "locations" && parts[1] !== undefined) {
    const loc = (r?.locations as Record<string, unknown>[] | undefined)?.[Number(parts[1])];
    const name = (loc?.name as string) ?? `Location #${Number(parts[1]) + 1}`;
    return parts.length > 2 ? `${name} → ${parts.slice(2).join(" ")}` : name;
  }
  return parts.join(" → ") || "menu";
}

function friendly(message: string): string {
  if (/expected (string|number|array|object), received undefined/i.test(message) || /Required/i.test(message))
    return "is missing";
  if (/Invalid option: expected one of/i.test(message)) return message.replace(/^Invalid option: expected one of/, "must be one of");
  return message;
}

/**
 * Lint menu.yaml text. Errors block serving; warnings are things agents will notice
 * (unknown allergens, untracked stock, missing hours) phrased for a non-developer owner.
 */
export function lintMenu(text: string): { findings: LintFinding[]; file?: MenuFile } {
  const result = parseMenuYaml(text);
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  const raw = doc.toJS();
  const lineOf = (path: (string | number)[]) => {
    const node = doc.getIn(path, true) as { range?: [number, number] } | undefined;
    return node?.range ? lineCounter.linePos(node.range[0]).line : null;
  };

  if ("issues" in result)
    return {
      findings: result.issues.map((i) => ({
        severity: "error" as const,
        line: i.line,
        message: i.path ? `${describePath(raw, i.path)}: ${friendly(i.message)}` : i.message,
      })),
    };

  const file = result.file;
  const findings: LintFinding[] = [];
  const err = (line: number | null, message: string) => findings.push({ severity: "error", line, message });
  const warn = (line: number | null, message: string) => findings.push({ severity: "warning", line, message });

  const locIds = new Set(file.locations.map((l) => l.id));
  const catIds = new Set(file.categories.map((c) => c.id));
  const seen = new Map<string, number>();

  file.locations.forEach((l, i) => {
    if (!l.hours || Object.keys(l.hours).length === 0)
      warn(lineOf(["locations", i]), `${l.name} has no opening hours. Agents can't tell when you're open, so they won't order.`);
    else if (Object.keys(l.hours).length < 7)
      warn(lineOf(["locations", i, "hours"]), `${l.name} lists hours for ${Object.keys(l.hours).length} of 7 days. Missing days are treated as closed.`);
    if (l.fulfillment.includes("delivery") && !l.delivery)
      err(lineOf(["locations", i, "fulfillment"]), `${l.name} offers delivery but has no delivery: section (radius_km or postal_codes, and a fee).`);
    if (l.address.lat == null && l.delivery?.radius_km)
      warn(lineOf(["locations", i, "address"]), `${l.name} delivers by radius but the address has no lat/lng. Add them so delivery zones can be checked.`);
  });

  file.items.forEach((item, i) => {
    const line = lineOf(["items", i]);
    if (seen.has(item.id)) err(line, `${item.name}: id "${item.id}" is already used on line ${seen.get(item.id)}. Ids must be unique.`);
    else seen.set(item.id, line ?? 0);
    if (!catIds.has(item.category))
      err(lineOf(["items", i, "category"]), `${item.name} is in category "${item.category}", which isn't defined under categories:.`);
    for (const l of item.locations ?? [])
      if (!locIds.has(l)) err(lineOf(["items", i, "locations"]), `${item.name} lists location "${l}", which doesn't exist.`);
    for (const l of Object.keys(item.stock_by_location ?? {}))
      if (!locIds.has(l)) err(lineOf(["items", i, "stock_by_location"]), `${item.name} has stock for unknown location "${l}".`);
    item.modifiers.forEach((g, gi) => {
      if (g.min > g.max) err(lineOf(["items", i, "modifiers", gi]), `${item.name} → ${g.name}: min (${g.min}) is more than max (${g.max}).`);
      if (g.min > g.options.length)
        err(lineOf(["items", i, "modifiers", gi]), `${item.name} → ${g.name}: requires ${g.min} choices but only has ${g.options.length} options.`);
    });

    if (!item.allergens)
      warn(line, `${item.name} has no allergen info, agents will treat it as unknown.`);
    else {
      const overlap = item.allergens.contains.filter((a) => item.allergens!.may_contain.includes(a));
      if (overlap.length)
        warn(lineOf(["items", i, "allergens"]), `${item.name} lists ${overlap.join(", ")} as both contains and may_contain. "contains" wins.`);
      if (item.dietary.includes("gluten_free") && item.allergens.contains.some((a) => a === "gluten" || a === "wheat"))
        err(lineOf(["items", i, "dietary"]), `${item.name} is tagged gluten_free but contains gluten/wheat.`);
      if (item.dietary.includes("vegan") && item.allergens.contains.some((a) => a === "milk" || a === "egg"))
        err(lineOf(["items", i, "dietary"]), `${item.name} is tagged vegan but contains milk or egg.`);
      if (item.dietary.includes("nut_free") && item.allergens.contains.some((a) => a === "peanut" || a === "tree_nut"))
        err(lineOf(["items", i, "dietary"]), `${item.name} is tagged nut_free but contains nuts.`);
    }
    if (item.stock === undefined && !item.stock_by_location)
      warn(line, `${item.name} has no stock status. Agents will see availability "unknown" and may skip it.`);
    if (item.price === 0) warn(lineOf(["items", i, "price"]), `${item.name} costs $0.00. Is that right?`);
    if (item.serves > 1 && !/serve|tray|platter|box|cake|dozen/i.test(`${item.name} ${item.description ?? ""}`))
      warn(line, `${item.name} serves ${item.serves}. Consider saying so in the name, e.g. "(serves ${item.serves})".`);
  });

  if (file.items.length === 0) warn(lineOf(["items"]), "No items yet. Agents will find an empty menu.");
  if (!file.stock_updated_at)
    warn(null, "No stock_updated_at set. Freshness falls back to when menu.yaml was last saved.");
  else if (file.stock_updated_at !== "live") {
    const age = (Date.now() - new Date(file.stock_updated_at).getTime()) / 1000;
    if (age > file.stock_ttl_seconds)
      warn(lineOf(["stock_updated_at"]), `Stock was last updated ${Math.round(age / 3600)}h ago, past its ${Math.round(file.stock_ttl_seconds / 60)} min ttl. Agents will see it as stale.`);
  }

  findings.sort((a, b) => (a.severity === b.severity ? (a.line ?? 0) - (b.line ?? 0) : a.severity === "error" ? -1 : 1));
  return { findings, file };
}

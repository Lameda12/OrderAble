import { stringify } from "yaml";
import type { MenuSource } from "./adapters/types.js";
import { runDoctor } from "./doctor.js";
import { OrderableError } from "./errors.js";
import { type LintFinding, lintMenu } from "./lint.js";
import { MenuFile, type MenuFileInput } from "./menu-format.js";
import type { OrderableService } from "./service.js";

/**
 * Owner setup over MCP. The owner talks to their own AI assistant ("here's our menu", a photo
 * of the board, "we close at 4 on Sundays"); the assistant reads it and calls these functions.
 * Everything is validated with the same rules as `orderable validate` before it's saved, and
 * menu.yaml stays a readable file the owner never has to open.
 */

type Raw = Record<string, any>;

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";

/** The owner tools work with any adapter that can read and write the owner's menu. */
function source(service: OrderableService): MenuSource {
  const a = service.adapter as Partial<MenuSource>;
  if (typeof a.readMenu !== "function" || typeof a.writeMenu !== "function")
    throw new OrderableError(
      "ADAPTER_ERROR",
      `Owner setup can't edit the menu with the ${service.adapter.name} adapter. Use the file adapter or a hosted account.`,
    );
  return a as MenuSource;
}

const load = async (service: OrderableService) => ((await source(service).readMenu()) as Raw | null) ?? null;

/** Put keys in the order a person would read them: business first, id and name before details. */
function tidy(raw: Raw): Raw {
  const order = (o: Raw, first: string[], last: string[] = []) => {
    const keys = [...first.filter((k) => k in o), ...Object.keys(o).filter((k) => !first.includes(k) && !last.includes(k)), ...last.filter((k) => k in o)];
    return Object.fromEntries(keys.map((k) => [k, o[k]]));
  };
  return order(
    {
      ...raw,
      ...(raw.locations ? { locations: (raw.locations as Raw[]).map((l) => order(l, ["id", "name", "address", "phone", "timezone", "hours"])) } : {}),
      ...(raw.items ? { items: (raw.items as Raw[]).map((i) => order(i, ["id", "name", "description", "category", "price"], ["stock", "stock_by_location"])) } : {}),
    },
    ["business", "locations", "categories", "items", "stock_updated_at", "stock_ttl_seconds"],
  );
}

/** Validate the whole menu, then write it. Nothing is written if it doesn't pass. */
async function save(service: OrderableService, input: Raw): Promise<LintFinding[]> {
  const raw = tidy(input);
  const parsed = MenuFile.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "menu"}: ${i.message}`);
    throw new OrderableError("INVALID_REQUEST", `Not saved. ${problems.slice(0, 6).join("; ")}`, null, { problems });
  }
  const { findings } = lintMenu(stringify(raw));
  const errors = findings.filter((f) => f.severity === "error");
  if (errors.length)
    throw new OrderableError("INVALID_REQUEST", `Not saved. ${errors.map((e) => e.message).join(" ")}`, null, { findings: errors });
  await source(service).writeMenu(raw);
  return findings;
}

const plain = (findings: LintFinding[]) => findings.map((f) => f.message);

// ---------------------------------------------------------------- setup

export async function getSetup(service: OrderableService) {
  const raw = await load(service);
  if (!raw)
    return {
      has_menu: false,
      business: null,
      locations: [],
      items: [],
      readiness: null,
      issues: [],
      next_step:
        "No menu yet. Ask the owner for the business name and type, each location's address, opening hours, sales tax rate, and whether they do pickup or delivery, then call owner_save_business.",
    };
  const findings = lintMenu(stringify(raw)).findings;
  const report = await runDoctor(service.adapter, service.config, service.now());
  return {
    has_menu: true,
    business: raw.business ?? null,
    locations: raw.locations ?? [],
    items: ((raw.items ?? []) as Raw[]).map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      price: i.price,
      stock: i.stock ?? null,
      has_allergen_info: !!i.allergens,
    })),
    readiness: { score: report.score, top_fixes: report.top_fixes },
    issues: plain(findings),
    next_step:
      report.score >= 90
        ? "The menu is in good shape. Offer to fix any remaining issues, or update stock as things sell out."
        : "Work through the top fixes with the owner, one question at a time.",
  };
}

export interface LocationInput {
  id?: string | undefined;
  name: string;
  address: { line1: string; line2?: string | undefined; city: string; region: string; postal_code: string; country?: string | undefined; lat?: number | undefined; lng?: number | undefined };
  phone?: string | undefined;
  timezone?: string | undefined;
  hours?: Record<string, string> | undefined;
  fulfillment?: string[] | undefined;
  delivery?: { radius_km?: number | undefined; postal_codes?: string[] | undefined; fee?: number | undefined; minimum?: number | undefined; minutes?: number | undefined } | undefined;
  prep_minutes?: number | undefined;
  tax_rate: number;
}

export async function saveBusiness(
  service: OrderableService,
  input: {
    name: string;
    type: string;
    currency?: string | undefined;
    website?: string | undefined;
    locations: LocationInput[];
    cancellation?: { free_within_minutes?: number | undefined; until_minutes_before_ready?: number | undefined } | undefined;
    refund_policy?: string | undefined;
  },
) {
  const raw: Raw = (await load(service)) ?? { categories: [], items: [], stock_updated_at: "live", stock_ttl_seconds: 900 };
  const prev = (raw.business ?? {}) as Raw;
  raw.business = {
    ...prev,
    id: prev.id ?? slugify(input.name),
    name: input.name,
    type: input.type,
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.website ? { website: input.website } : {}),
    policies: {
      ...(prev.policies ?? {}),
      ...(input.cancellation ? { cancellation: { ...(prev.policies?.cancellation ?? {}), ...input.cancellation } } : {}),
      ...(input.refund_policy ? { refund: input.refund_policy } : {}),
    },
  };
  const existing = ((raw.locations ?? []) as Raw[]).slice();
  const changed: string[] = [];
  for (const loc of input.locations) {
    const id = loc.id ?? slugify(loc.name);
    const clean = Object.fromEntries(Object.entries({ ...loc, id }).filter(([, v]) => v !== undefined));
    const i = existing.findIndex((l) => l.id === id);
    if (i >= 0) existing[i] = { ...existing[i], ...clean };
    else existing.push(clean);
    changed.push(id);
  }
  raw.locations = existing;
  const findings = await save(service, raw);
  return {
    saved: true,
    business_id: raw.business.id,
    location_ids: changed,
    issues: plain(findings),
    next_step:
      (raw.items ?? []).length === 0
        ? "Business saved. Now ask for the menu (a photo or pasted text works) and call owner_upsert_items."
        : "Business saved. Call owner_get_setup to see what's left to fix.",
  };
}

export interface ItemInput {
  id?: string | undefined;
  name: string;
  category: string;
  price: number;
  description?: string | undefined;
  dietary?: string[] | undefined;
  allergens?: { contains?: string[] | undefined; may_contain?: string[] | undefined } | undefined;
  modifiers?: { name: string; min?: number | undefined; max?: number | undefined; options: { name: string; price?: number | undefined }[] }[] | undefined;
  stock?: string | undefined;
  quantity?: number | undefined;
  lead_time?: string | undefined;
  serves?: number | undefined;
  role?: string | undefined;
  only_for?: string[] | undefined;
  locations?: string[] | undefined;
}

export async function upsertItems(service: OrderableService, input: { items: ItemInput[] }) {
  const raw = await load(service);
  if (!raw?.business)
    throw new OrderableError("INVALID_REQUEST", "There's no business yet. Save the business and a location first.", "owner_save_business");

  const categories = ((raw.categories ?? []) as Raw[]).slice();
  const items = ((raw.items ?? []) as Raw[]).slice();
  const created: string[] = [];
  const updated: string[] = [];

  for (const it of input.items) {
    let cat = categories.find((c) => c.id === it.category || String(c.name).toLowerCase() === it.category.toLowerCase());
    if (!cat) {
      cat = { id: slugify(it.category), name: it.category };
      categories.push(cat);
    }
    const id = it.id ?? items.find((x) => String(x.name).toLowerCase() === it.name.toLowerCase())?.id ?? slugify(it.name);
    const fields: Raw = {
      id,
      name: it.name,
      category: cat.id,
      price: it.price,
      ...(it.description !== undefined ? { description: it.description } : {}),
      ...(it.dietary ? { dietary: it.dietary } : {}),
      ...(it.allergens ? { allergens: { contains: it.allergens.contains ?? [], may_contain: it.allergens.may_contain ?? [] } } : {}),
      ...(it.modifiers
        ? {
            modifiers: it.modifiers.map((g) => ({
              id: slugify(g.name),
              name: g.name,
              min: g.min ?? 0,
              max: g.max ?? 1,
              options: g.options.map((o) => ({ id: slugify(o.name), name: o.name, price: o.price ?? 0 })),
            })),
          }
        : {}),
      ...(it.stock ? { stock: it.quantity != null ? { status: it.stock, quantity: it.quantity } : it.stock } : {}),
      ...(it.lead_time ? { lead_time: it.lead_time } : {}),
      ...(it.serves ? { serves: it.serves } : {}),
      ...(it.role ? { role: it.role } : {}),
      ...(it.only_for ? { only_for: it.only_for } : {}),
      ...(it.locations ? { locations: it.locations } : {}),
    };
    const i = items.findIndex((x) => x.id === id);
    if (i >= 0) {
      items[i] = { ...items[i], ...fields };
      updated.push(id);
    } else {
      // New items with no stock status start as in stock: the owner just told us they sell it.
      items.push({ stock: "in_stock", ...fields });
      created.push(id);
    }
  }
  raw.categories = categories;
  raw.items = items;
  const findings = await save(service, raw);
  const noAllergens = input.items.filter((i) => !i.allergens).map((i) => i.name);
  return {
    saved: created.length + updated.length,
    created,
    updated,
    issues: plain(findings),
    next_step: noAllergens.length
      ? `Saved. Allergens are unknown for: ${noAllergens.slice(0, 8).join(", ")}${noAllergens.length > 8 ? "…" : ""}. Ask the owner what they contain; don't guess.`
      : "Saved. Call owner_get_setup to check readiness.",
  };
}

export async function removeItems(service: OrderableService, input: { item_ids: string[] }) {
  const raw = await load(service);
  if (!raw) throw new OrderableError("INVALID_REQUEST", "There's no menu yet.", "owner_save_business");
  const before = (raw.items ?? []).length;
  raw.items = ((raw.items ?? []) as Raw[]).filter((i) => !input.item_ids.includes(i.id));
  const removed = before - raw.items.length;
  const findings = await save(service, raw);
  return { removed, issues: plain(findings), next_step: removed ? "Removed." : "No matching items; check ids with owner_get_setup." };
}

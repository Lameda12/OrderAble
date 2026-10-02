import type { Adapter, StockChange } from "./adapters/types.js";
import type { Item, Location, StockStatus } from "./schema.js";

/**
 * Owners update stock by texting the bot in plain words: "out of croissants", "6 morning
 * buns left", "sourdough is back", "86 the soup at Quinpool". Parsing is plain rules, no LLM,
 * so it is instant, free, and does exactly what it says. Ambiguous messages change nothing
 * and ask a question instead.
 */

export interface StockIntent {
  status: StockStatus;
  quantity: number | null;
  itemQuery: string;
  locationQuery: string | null;
}

const FILLER = /^(?:hey|hi|ok|okay|so|just|fyi|update:?|stock:?|\/stock)\s+/;
const SUBJECT = /^(?:we(?:'re| are| re)|we've|we have|i'm|im|i am|now)\s+/;

/** Quantity → status. A known small number is "low" so agents warn customers it may go. */
export const statusFor = (n: number): StockStatus => (n === 0 ? "sold_out" : n <= 5 ? "low" : "in_stock");

export function parseStockMessage(input: string): StockIntent | null {
  let t = input
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[!.?,;]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (let i = 0; i < 3; i++) t = t.replace(FILLER, "").replace(SUBJECT, "");

  let locationQuery: string | null = null;
  const at = /\s+(?:at|@|in)\s+(?:the\s+)?([a-z0-9' -]+?)(?:\s+(?:location|store|shop))?$/.exec(t);
  if (at) {
    locationQuery = at[1]!.trim();
    t = t.slice(0, at.index).trim();
  }
  t = t.replace(/^(?:all|the|our)\s+/, "");

  const rules: [RegExp, (m: RegExpExecArray) => Omit<StockIntent, "locationQuery">][] = [
    [/^(?:out of|sold out of|no more|none left of|86(?:'?d|ed)?(?: the)?)\s+(.+)$/, (m) => ({ status: "sold_out", quantity: 0, itemQuery: m[1]! })],
    [/^(.+?)\s+(?:is |are )?(?:sold out|all gone|gone|out|86(?:'?d|ed)?)$/, (m) => ({ status: "sold_out", quantity: 0, itemQuery: m[1]! })],
    [/^(?:only\s+)?(\d+)\s+(.+?)\s+(?:left|remaining|available)$/, (m) => ({ status: statusFor(Number(m[1])), quantity: Number(m[1]), itemQuery: m[2]! })],
    [/^(.+?)\s*[=:]\s*(\d+)(?:\s+left)?$/, (m) => ({ status: statusFor(Number(m[2])), quantity: Number(m[2]), itemQuery: m[1]! })],
    [/^(?:running low on|low on)\s+(.+)$/, (m) => ({ status: "low", quantity: null, itemQuery: m[1]! })],
    [/^(.+?)\s+(?:is |are )?(?:running low|low)$/, (m) => ({ status: "low", quantity: null, itemQuery: m[1]! })],
    [/^(?:back in stock|restocked|more|got more|baked more|made more)\s*[:\s]\s*(.+)$/, (m) => ({ status: "in_stock", quantity: null, itemQuery: m[1]! })],
    [/^(.+?)\s+(?:is |are )?(?:back(?: in stock)?|in stock|restocked|available)(?: again)?$/, (m) => ({ status: "in_stock", quantity: null, itemQuery: m[1]! })],
  ];
  for (const [re, make] of rules) {
    const m = re.exec(t);
    if (m) {
      const intent = make(m);
      const itemQuery = intent.itemQuery.replace(/^(?:the|our|all)\s+/, "").trim();
      if (itemQuery) return { ...intent, itemQuery, locationQuery };
    }
  }
  return null;
}

const singular = (w: string) => (w.length > 3 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && /(?:ches|shes|sses|xes)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !["the", "a", "an", "of", "and", "with"].includes(w))
    .map(singular);

/** Items whose name contains every word of the query, best (fewest extra words) first. */
export function matchItems(query: string, items: Item[]): { best: Item[]; suggestions: Item[] } {
  const q = words(query);
  if (!q.length) return { best: [], suggestions: [] };
  const scored = items.map((item) => {
    const name = words(item.name);
    const hits = q.filter((w) => name.includes(w)).length;
    return { item, full: hits === q.length, hits, extra: name.length - hits };
  });
  const full = scored.filter((s) => s.full).sort((a, b) => a.extra - b.extra);
  const exact = full.filter((s) => s.extra === 0);
  const best = exact.length ? exact : full;
  const suggestions = scored
    .filter((s) => !s.full && s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3)
    .map((s) => s.item);
  return { best: best.map((s) => s.item), suggestions };
}

function matchLocation(query: string, locations: Location[]): Location[] {
  const q = words(query);
  return locations.filter((l) => {
    const name = words(`${l.name} ${l.address.city} ${l.address.line1}`);
    return q.every((w) => name.includes(w));
  });
}

export const STOCK_HELP = `Update stock by texting me, for example:
  out of croissants
  6 morning buns left
  sourdough is back
  running low on lattes
  86 the soup at Quinpool
Agents see the change straight away.`;

export interface StockResult {
  handled: boolean;
  message: string;
  changes: StockChange[];
}

const describe = (c: { status: StockStatus; quantity: number | null }) =>
  c.status === "sold_out" ? "sold out" : c.quantity != null ? `${c.quantity} left${c.status === "low" ? " (low)" : ""}` : c.status === "low" ? "running low" : "back in stock";

/**
 * Parse an owner's message and apply it. Returns handled=false if the text isn't a stock
 * update at all, so callers can treat it as an ordinary chat message instead.
 */
export async function applyStockMessage(adapter: Adapter, text: string): Promise<StockResult> {
  const intent = parseStockMessage(text);
  if (!intent) return { handled: false, message: "", changes: [] };
  if (!adapter.updateStock)
    return { handled: true, message: `Stock updates by text aren't supported for the ${adapter.name} adapter yet.`, changes: [] };

  const locations = await adapter.listLocations();
  const itemsById = new Map<string, Item>();
  for (const loc of locations) for (const item of (await adapter.getMenu(loc.id)).items) itemsById.set(item.id, item);
  const { best, suggestions } = matchItems(intent.itemQuery, [...itemsById.values()]);

  if (best.length === 0)
    return {
      handled: true,
      changes: [],
      message: `I couldn't find "${intent.itemQuery}" on the menu.${suggestions.length ? ` Did you mean ${suggestions.map((i) => i.name).join(", ")}?` : ""} Nothing changed.`,
    };
  if (best.length > 1)
    return {
      handled: true,
      changes: [],
      message: `"${intent.itemQuery}" matches ${best.length} items: ${best.map((i) => i.name).join(", ")}. Which one? Nothing changed yet.`,
    };

  const item = best[0]!;
  let targets = locations.filter((l) => l.business_id === item.business_id && (!item.location_ids || item.location_ids.includes(l.id)));
  if (intent.locationQuery) {
    const picked = matchLocation(intent.locationQuery, targets);
    if (picked.length === 0)
      return {
        handled: true,
        changes: [],
        message: `${item.name} isn't sold at "${intent.locationQuery}". It's sold at ${targets.map((l) => l.name).join(", ")}. Nothing changed.`,
      };
    targets = picked;
  }

  const changes = targets.map((l) => ({ location_id: l.id, item_id: item.id, status: intent.status, quantity: intent.quantity }));
  await adapter.updateStock(changes);
  return {
    handled: true,
    changes,
    message: `Done. ${item.name}: ${describe(intent)} at ${targets.map((l) => l.name).join(", ")}. Agents see it now.`,
  };
}

/** Owner allow-lists come from env: comma-separated Telegram user ids / Slack user ids. */
export const ownerIds = (env: string | undefined) =>
  new Set(
    (env ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

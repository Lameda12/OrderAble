import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { LineCounter, parseDocument, stringify } from "yaml";
import { OrderableError } from "../errors.js";
import { MenuFile, normalizeMenu } from "../menu-format.js";
import type { Catalog } from "../schema.js";
import { LocalCatalogAdapter } from "./local.js";
import type { MenuSource, StockChange } from "./types.js";

export interface MenuIssue {
  path: string;
  line: number | null;
  message: string;
}

/** Parse menu.yaml text into a Catalog, or return issues with line numbers. */
export function parseMenuYaml(text: string): { catalog: Catalog; file: MenuFile } | { issues: MenuIssue[] } {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false });
  if (doc.errors.length)
    return {
      issues: doc.errors.map((e) => ({
        path: "",
        line: e.linePos?.[0]?.line ?? null,
        message: `YAML syntax: ${e.message.split("\n")[0]}`,
      })),
    };

  const parsed = MenuFile.safeParse(doc.toJS());
  if (!parsed.success)
    return {
      issues: parsed.error.issues.map((issue) => {
        // Walk up the path until we find a node with a source range.
        let line: number | null = null;
        for (let n = issue.path.length; n >= 0 && line === null; n--) {
          const node = doc.getIn(issue.path.slice(0, n) as (string | number)[], true) as { range?: [number, number] } | undefined;
          if (node?.range) line = lineCounter.linePos(node.range[0]).line;
        }
        return { path: issue.path.join("."), line, message: issue.message };
      }),
    };
  return { catalog: normalizeMenu(parsed.data), file: parsed.data };
}

/** Line number lookup for the validator's warnings (e.g. items with no allergen info). */
export function yamlLineOf(text: string, path: (string | number)[]): number | null {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  const node = doc.getIn(path, true) as { range?: [number, number] } | undefined;
  return node?.range ? lineCounter.linePos(node.range[0]).line : null;
}

export function loadMenuFile(path: string): Catalog {
  const abs = resolve(path);
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    throw new OrderableError("ADAPTER_ERROR", `Cannot read menu file at ${abs}. Run \`orderable init\` to create one.`);
  }
  const result = parseMenuYaml(text);
  if ("issues" in result)
    throw new OrderableError(
      "ADAPTER_ERROR",
      `menu.yaml has ${result.issues.length} problem(s). Run \`orderable validate\`.\n` +
        result.issues
          .slice(0, 5)
          .map((i) => `  line ${i.line ?? "?"}: ${i.path} ${i.message}`)
          .join("\n"),
    );
  // No explicit stock timestamp: the data is exactly as fresh as the file.
  if (!result.file.stock_updated_at) result.catalog.stock_as_of = statSync(abs).mtime.toISOString();
  return result.catalog;
}

const MENU_HEADER = `# Menu for Orderable. Written by your AI assistant through Orderable's owner tools.
# You can still edit it by hand; run \`orderable validate\` afterwards.
`;

export const emptyCatalog = (): Catalog => ({
  businesses: [],
  locations: [],
  categories: [],
  items: [],
  stock: [],
  stock_as_of: null,
  stock_ttl_seconds: 900,
});

/** Serves a business from menu.yaml and hot-reloads it when the owner edits the file. */
export class FileAdapter extends LocalCatalogAdapter implements MenuSource {
  override readonly name = "file";
  private mtimeMs: number;

  constructor(
    private readonly path: string,
    opts: { now?: () => Date } = {},
  ) {
    // A brand-new owner may not have a menu yet; they create it through the owner tools.
    const exists = existsSync(resolve(path));
    super(exists ? loadMenuFile(path) : emptyCatalog(), opts);
    this.mtimeMs = exists ? statSync(resolve(path)).mtimeMs : 0;
    const reload = () => this.reloadIfChanged();
    for (const m of ["listBusinesses", "listLocations", "getMenu", "getItem", "getAvailability", "quote"] as const) {
      const original = this[m].bind(this) as (...args: unknown[]) => Promise<unknown>;
      (this as unknown as Record<string, unknown>)[m] = (...args: unknown[]) => (reload(), original(...args));
    }
  }

  /**
   * Write owner stock changes back into menu.yaml (comments and layout are kept), then reload,
   * so the file stays the single source of truth.
   */
  override async updateStock(changes: StockChange[]) {
    const abs = resolve(this.path);
    const doc = parseDocument(readFileSync(abs, "utf8"));
    const raw = doc.toJS() as {
      locations: { id: string }[];
      items: { id: string; locations?: string[]; stock_by_location?: Record<string, unknown> }[];
      stock_updated_at?: string;
    };
    const allLocations = raw.locations.map((l) => l.id);
    const value = (c: StockChange) => {
      if (c.quantity == null) return c.status;
      const node = doc.createNode({ status: c.status, quantity: c.quantity });
      node.flow = true;
      return node;
    };

    for (const itemId of new Set(changes.map((c) => c.item_id))) {
      const idx = raw.items.findIndex((i) => i.id === itemId);
      if (idx < 0) continue;
      const item = raw.items[idx]!;
      const mine = changes.filter((c) => c.item_id === itemId);
      const offeredAt = item.locations ?? allLocations;
      const same = mine.every((c) => c.status === mine[0]!.status && c.quantity === mine[0]!.quantity);
      const everywhere = offeredAt.every((l) => mine.some((c) => c.location_id === l));
      if (everywhere && same && !item.stock_by_location) doc.setIn(["items", idx, "stock"], value(mine[0]!));
      else for (const c of mine) doc.setIn(["items", idx, "stock_by_location", c.location_id], value(c));
    }
    if (raw.stock_updated_at && raw.stock_updated_at !== "live") doc.set("stock_updated_at", this.now().toISOString());

    writeFileSync(abs, doc.toString());
    this.catalog = loadMenuFile(this.path);
    this.mtimeMs = statSync(abs).mtimeMs;
  }

  async readMenu() {
    const abs = resolve(this.path);
    return existsSync(abs) ? ((parseDocument(readFileSync(abs, "utf8")).toJS() as Record<string, unknown>) ?? null) : null;
  }

  /** Write the menu, keeping the owner's comments at the top of an existing file. */
  async writeMenu(menu: Record<string, unknown>) {
    const abs = resolve(this.path);
    let text: string;
    if (existsSync(abs)) {
      const doc = parseDocument(readFileSync(abs, "utf8"));
      for (const [k, v] of Object.entries(menu)) doc.set(k, doc.createNode(v));
      text = doc.toString();
    } else {
      text = MENU_HEADER + stringify(menu);
    }
    writeFileSync(abs, text);
    this.reload();
  }

  /** Re-read menu.yaml now (after the owner tools write it). */
  reload() {
    this.catalog = loadMenuFile(this.path);
    this.mtimeMs = statSync(resolve(this.path)).mtimeMs;
  }

  /** Where this adapter's menu lives, for the owner tools. */
  get menuPath() {
    return resolve(this.path);
  }

  private reloadIfChanged() {
    try {
      const m = statSync(resolve(this.path)).mtimeMs;
      if (m !== this.mtimeMs) {
        this.catalog = loadMenuFile(this.path);
        this.mtimeMs = m;
      }
    } catch {
      // Keep serving the last good menu if the file is mid-save or briefly invalid.
    }
  }
}

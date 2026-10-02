import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { LineCounter, parseDocument } from "yaml";
import { OrderableError } from "../errors.js";
import { MenuFile, normalizeMenu } from "../menu-format.js";
import type { Catalog } from "../schema.js";
import { LocalCatalogAdapter } from "./local.js";

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

/** Serves a business from menu.yaml and hot-reloads it when the owner edits the file. */
export class FileAdapter extends LocalCatalogAdapter {
  override readonly name = "file";
  private mtimeMs: number;

  constructor(
    private readonly path: string,
    opts: { now?: () => Date } = {},
  ) {
    super(loadMenuFile(path), opts);
    this.mtimeMs = statSync(resolve(path)).mtimeMs;
    const reload = () => this.reloadIfChanged();
    for (const m of ["listBusinesses", "listLocations", "getMenu", "getItem", "getAvailability", "quote"] as const) {
      const original = this[m].bind(this) as (...args: unknown[]) => Promise<unknown>;
      (this as unknown as Record<string, unknown>)[m] = (...args: unknown[]) => (reload(), original(...args));
    }
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

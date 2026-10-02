// Copies the Orderable server source (../src) into lib/orderable so the site's serverless
// functions run the exact same code as the npm package, with no cross-package resolution.
// Relative ".js" specifiers (NodeNext style) are rewritten to extensionless for the bundler.
import { cpSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, "../../src");
const to = resolve(here, "../lib/orderable");
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
for (const file of walk(to)) {
  const src = readFileSync(file, "utf8");
  writeFileSync(file, src.replace(/(from\s+["'])(\.{1,2}\/[^"']+)\.js(["'])/g, "$1$2$3"));
}
console.log(`synced ${from} -> ${to}`);

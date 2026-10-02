/**
 * Regenerates examples/team-lunch.md from a real run against the mock adapter.
 *   npx tsx scripts/team-lunch.ts > examples/team-lunch.md
 */
import { MockAdapter } from "../src/adapters/mock.js";
import { defaultConfig } from "../src/config.js";
import { runTeamLunchDemo } from "../src/demo.js";
import { OrderableService } from "../src/service.js";
import { MemoryStore } from "../src/store-memory.js";

// Wednesday 7 October 2026, 10:00 in Halifax.
const now = () => new Date("2026-10-07T13:00:00Z");
const service = new OrderableService({ adapter: new MockAdapter({ now }), store: new MemoryStore(), config: defaultConfig(), now });
const steps = await runTeamLunchDemo(service);

const trim = (tool: string, r: any) => {
  if (tool === "list_locations")
    return { locations: r.locations.map((l: any) => ({ id: l.id, name: l.name, open_now: l.open_now, hours_today: l.hours_today, delivers_to_you: l.delivers_to_you, delivery_fee: l.delivery_fee })), as_of: r.as_of, ttl_seconds: r.ttl_seconds };
  if (tool === "plan_group_order") {
    const { lines: _lines, ...rest } = r;
    return rest;
  }
  if (tool === "quote_order") {
    const { lines, ...rest } = r;
    return { ...rest, lines: lines.map((l: any) => ({ item_id: l.item_id, name: l.name, quantity: l.quantity, unit_price: l.unit_price, line_total: l.line_total })) };
  }
  if (tool === "place_order") {
    const { lines: _l, ...order } = r.order;
    return { ...r, order };
  }
  return r;
};

const out: string[] = [
  "# Team lunch for 12, planned and ordered by an agent",
  "",
  "A real transcript: an agent connected to Orderable (mock adapter, Crumb & Co + Northline Coffee in Halifax) orders lunch for 12 people with 3 vegetarians and 1 gluten-free person, under $20 a head, delivered.",
  "",
  "The agent narration is scripted. **Every tool call and result below is real output** from the server, regenerated with `npx tsx scripts/team-lunch.ts > examples/team-lunch.md`. The clock is pinned to Wednesday 7 October 2026, 10:00 ADT. Some long fields are trimmed for readability (noted inline).",
  "",
];
for (const s of steps) {
  if (s.kind === "user") out.push(`**Customer:** ${s.text}`, "");
  else if (s.kind === "agent") out.push(`**Agent:** ${s.text}`, "");
  else {
    out.push(
      `<details${s.tool === "plan_group_order" || s.tool === "quote_order" ? " open" : ""}><summary><code>${s.tool}</code>${s.isError ? " (error)" : ""}</summary>`,
      "",
      "```json",
      `// → ${s.tool}`,
      JSON.stringify(s.args, null, 2),
      "```",
      "",
      "```json",
      `// ← result${["list_locations", "plan_group_order", "quote_order", "place_order"].includes(s.tool!) ? " (trimmed)" : ""}`,
      JSON.stringify(trim(s.tool!, s.result), null, 2),
      "```",
      "",
      "</details>",
      "",
    );
  }
}
out.push(
  "## What to notice",
  "",
  "- **The budget is all-in.** `plan_group_order` backs out 14% HST and the $4.99 delivery fee before choosing food, then only adds drinks because they still fit.",
  "- **Diets are covered with real tags, not guesses.** The gluten-free person gets the Harvest Grain Bowl, which carries the `gluten_free` tag. The vegetarians are split across two options.",
  "- **The quote locks the price for 10 minutes.** `place_order` re-checks stock, prices and the spending policy before accepting it.",
  "- **The retry is safe.** Same `idempotency_key` returns the original order with `idempotent_replay: true`. Nobody gets 24 sandwiches.",
  "- **DRY_RUN is on by default.** The order is recorded with a note that it was not sent to the kitchen, until the owner flips `dry_run: false`.",
  "- **No card data.** Payment is an invoice on the company account.",
  "",
);
console.log(out.join("\n"));

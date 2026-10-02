"use client";
import { useEffect, useState } from "react";
import { JsonView } from "./json";

const TOKEN = "orderable-demo";

function tomorrowNoonHalifax() {
  // 12:00 in Halifax is 15:00Z (ADT) or 16:00Z (AST). Close enough for a demo preset.
  const d = new Date(Date.now() + 24 * 3600_000);
  d.setUTCHours(15, 0, 0, 0);
  return d.toISOString();
}

const presets: { label: string; name: string; arguments: Record<string, unknown>; note: string }[] = [
  {
    label: "list_locations",
    name: "list_locations",
    arguments: { near: { lat: 44.6488, lng: -63.5752 }, postal_code: "B3J 3N4" },
    note: "Nearest first, open now, and whether each delivers to you.",
  },
  {
    label: "search_menu · vegan",
    name: "search_menu",
    arguments: { location_id: "northline-barrington", dietary: ["vegan"], exclude_allergens: ["sesame"] },
    note: "Dietary filters and allergen exclusion. Live availability on every item.",
  },
  {
    label: "get_item · unknown allergens",
    name: "get_item",
    arguments: { item_id: "crumb-fruit-galette" },
    note: "The bakery never listed allergens for this one. Agents see unknown, never safe.",
  },
  {
    label: "check_availability · cake",
    name: "check_availability",
    arguments: {
      location_id: "crumb-quinpool",
      item_ids: ["crumb-chocolate-cake", "crumb-morning-bun"],
      desired_time: "TOMORROW_NOON",
      quantities: { "crumb-morning-bun": 6 },
    },
    note: "The cake needs 48h notice. The morning bun sells out daily.",
  },
  {
    label: "quote_order · sold out",
    name: "quote_order",
    arguments: { location_id: "crumb-hydrostone", lines: [{ item_id: "crumb-morning-bun", quantity: 2 }], fulfillment: "pickup" },
    note: "A structured error with a code and the tool to call next.",
  },
  {
    label: "quote_order · lattes",
    name: "quote_order",
    arguments: {
      location_id: "northline-barrington",
      fulfillment: "pickup",
      desired_time: "TOMORROW_NOON",
      lines: [
        {
          item_id: "nl-latte",
          quantity: 3,
          modifiers: [
            { group_id: "size", option_id: "large" },
            { group_id: "milk", option_id: "oat" },
            { group_id: "temperature", option_id: "iced" },
          ],
        },
      ],
    },
    note: "Modifiers priced in, tax computed, price locked for 10 minutes.",
  },
];

const hydrate = (s: string) => s.replaceAll('"TOMORROW_NOON"', JSON.stringify(tomorrowNoonHalifax()));

export function Console() {
  const [active, setActive] = useState(0);
  const [body, setBody] = useState("");
  const [out, setOut] = useState<unknown>(null);
  const [meta, setMeta] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("https://your-deployment.vercel.app");
  const [copied, setCopied] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    const p = presets[active]!;
    setBody(hydrate(JSON.stringify({ name: p.name, arguments: p.arguments }, null, 2)));
    setOut(null);
    setMeta(null);
  }, [active]);

  async function run() {
    setBusy(true);
    setMeta(null);
    const t0 = performance.now();
    try {
      const params = JSON.parse(body);
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params }),
      });
      const json = await res.json();
      const result = json.result;
      const payload = result?.structuredContent ?? (result?.content?.[0]?.text ? JSON.parse(result.content[0].text) : json);
      setOut(payload);
      setMeta({
        ok: res.ok && !result?.isError,
        text: `HTTP ${res.status} · ${Math.round(performance.now() - t0)} ms${result?.isError ? ` · isError: ${payload?.error?.code}` : ""}`,
      });
    } catch (e) {
      setOut({ error: e instanceof Error ? e.message : String(e) });
      setMeta({ ok: false, text: "Invalid JSON or network error" });
    } finally {
      setBusy(false);
    }
  }

  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    });
  };

  const endpoint = `${origin}/api/mcp`;
  const claudeCmd = `claude mcp add --transport http orderable-demo ${endpoint} --header "Authorization: Bearer ${TOKEN}"`;

  return (
    <>
      <div className="console window">
        <div className="presets">
          {presets.map((p, i) => (
            <button key={p.label} className={`preset ${i === active ? "on" : ""}`} onClick={() => setActive(i)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="console-body">
          <textarea spellCheck={false} value={body} onChange={(e) => setBody(e.target.value)} aria-label="tools/call params" />
          <pre aria-live="polite">
            {out ? <JsonView value={out} /> : <span style={{ color: "var(--faint)" }}>{presets[active]!.note}</span>}
          </pre>
        </div>
        <div className="console-bar">
          <span className={meta ? (meta.ok ? "status-ok" : "status-err") : ""}>
            {meta ? meta.text : "POST /api/mcp · tools/call · Streamable HTTP"}
          </span>
          <button className="pill primary" style={{ padding: "9px 20px", fontSize: 15 }} onClick={run} disabled={busy}>
            {busy ? "Calling…" : "Call tool"}
          </button>
        </div>
      </div>
      <div className="connect">
        <div className="copyline">
          <span className="lbl">Endpoint</span>
          <span>{endpoint}</span>
          <button onClick={() => copy("e", endpoint)}>{copied === "e" ? "Copied" : "Copy"}</button>
        </div>
        <div className="copyline">
          <span className="lbl">Claude Code</span>
          <span>{claudeCmd}</span>
          <button onClick={() => copy("c", claudeCmd)}>{copied === "c" ? "Copied" : "Copy"}</button>
        </div>
      </div>
    </>
  );
}

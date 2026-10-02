"use client";
import { useEffect, useRef, useState } from "react";
import { JsonView, dollars } from "./json";

type Step = {
  kind: "user" | "agent" | "tool";
  text?: string;
  tool?: string;
  args?: Record<string, any>;
  result?: any;
  isError?: boolean;
  ms?: number;
};

const PROMPT =
  "Order lunch for the team tomorrow at noon. 12 people: 3 vegetarians, 1 gluten-free. Keep it under $20 a head, delivered to 1801 Hollis St.";

function gist(s: Step): { text: string; badge: string; alt?: boolean } {
  const a = s.args ?? {};
  const r = s.result ?? {};
  if (s.isError) return { text: JSON.stringify(a), badge: r?.error?.code ?? "error", alt: true };
  switch (s.tool) {
    case "list_locations":
      return { text: `postal_code: "${a.postal_code}", fulfillment: "${a.fulfillment}"`, badge: `${r.locations?.length ?? 0} locations` };
    case "plan_group_order":
      return {
        text: `headcount: ${a.headcount}, budget: ${dollars({ amount: a.budget_per_person })}/person, ${Object.entries(a.dietary_requirements ?? {})
          .map(([k, v]) => `${k} ${v}`)
          .join(", ")}`,
        badge: r.coverage?.fully_covered ? "everyone covered" : `${r.unmet?.length} unmet`,
      };
    case "quote_order":
      return { text: `${a.lines?.length} lines, ${a.fulfillment}, ${a.delivery_address?.line1}`, badge: `${dollars(r.total)} · locked 10 min` };
    case "place_order":
      return {
        text: `quote_id: "${a.quote_id}", idempotency_key: "${String(a.idempotency_key).slice(0, 8)}…", confirm: true`,
        badge: r.idempotent_replay ? "replay · same order" : r.order?.status,
        alt: !!r.idempotent_replay,
      };
    case "get_order_status":
      return { text: `order_id: "${a.order_id}"`, badge: r.status };
    default:
      return { text: JSON.stringify(a), badge: "ok" };
  }
}

const pace = (s: Step) => (s.kind === "user" ? 900 : s.kind === "agent" ? 1100 : 750);

export function LiveDemo() {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [shown, setShown] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  async function run() {
    setState("loading");
    setShown(0);
    setError("");
    try {
      const res = await fetch("/api/demo", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setSteps(json.steps);
      setState("playing");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  useEffect(() => {
    if (state !== "playing" || !steps) return;
    if (shown >= steps.length) {
      const t = setTimeout(() => setState("done"), 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 200 : pace(steps[shown]!));
    return () => clearTimeout(t);
  }, [state, steps, shown]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [shown, state]);

  const visible = steps?.slice(0, shown) ?? [];
  const plan = steps?.find((s) => s.tool === "plan_group_order")?.result;
  const quote = steps?.find((s) => s.tool === "quote_order")?.result;
  const order = steps?.find((s) => s.tool === "place_order")?.result?.order;
  const replay = steps?.filter((s) => s.tool === "place_order")[1]?.result;
  const totalMs = steps?.reduce((s, x) => s + (x.ms ?? 0), 0) ?? 0;
  const calls = steps?.filter((s) => s.kind === "tool").length ?? 0;
  const next = steps?.[shown];

  return (
    <div className="stage">
      <div className="window">
        <div className="window-bar">
          <div className="dots">
            <i />
            <i />
            <i />
          </div>
          <div className="title">
            <span className="live-dot" />
            Agent ↔ Orderable MCP · live
          </div>
        </div>
        <div className="convo" ref={scroller} style={{ maxHeight: 640, overflowY: "auto" }} aria-live="polite" tabIndex={0}>
          {state === "idle" || state === "loading" || state === "error" ? (
            <div className="demo-start">
              <div className="prompt">“{PROMPT}”</div>
              <button className="pill crust" onClick={run} disabled={state === "loading"}>
                {state === "loading" ? "Connecting…" : "▶  Run it live"}
              </button>
              <div style={{ fontSize: 13 }}>
                Real MCP client, real Orderable server, seeded Halifax cafe. Nothing is pre-recorded.
              </div>
              {state === "error" && <div style={{ color: "var(--err)", fontSize: 14 }}>Couldn’t reach the demo server: {error}</div>}
            </div>
          ) : (
            <>
              {visible.map((s, i) =>
                s.kind === "tool" ? (
                  <details className="call" key={i}>
                    <summary>
                      <span className="fn">{s.tool}</span>
                      <span className="gist">{gist(s).text}</span>
                      <span className={`badge ${gist(s).alt ? "alt" : ""}`}>{gist(s).badge}</span>
                      <span className="ms">{s.ms} ms</span>
                    </summary>
                    <pre>
                      <span style={{ color: "var(--faint)" }}>{"// → arguments\n"}</span>
                      <JsonView value={s.args} />
                      <span style={{ color: "var(--faint)" }}>{"\n\n// ← result\n"}</span>
                      <JsonView value={s.result} />
                    </pre>
                  </details>
                ) : (
                  <div className={`msg ${s.kind}`} key={i}>
                    {s.text}
                  </div>
                ),
              )}
              {state === "playing" && next && next.kind !== "user" && (
                <div className="typing">
                  <i />
                  <i />
                  <i />
                </div>
              )}
              {state === "done" && quote && plan && (
                <div className="receipt">
                  <div>
                    <div className="eyebrow" style={{ margin: 0, fontSize: 15 }}>
                      {plan.location_name}
                    </div>
                    <div className="total">{dollars(quote.total)}</div>
                    <div className="per">
                      {dollars(plan.estimate?.per_person)} a head · tax &amp; delivery included · budget {dollars(plan.estimate?.budget_total)}
                    </div>
                    <div className="chips">
                      {plan.coverage?.dietary?.map((d: any) => (
                        <span className="chip" key={d.requirement}>
                          ✓ {d.covered} {d.requirement.replace("_", "-")}
                        </span>
                      ))}
                      <span className="chip">✓ {plan.coverage?.people_with_a_main} fed</span>
                      {replay?.idempotent_replay && <span className="chip neutral">Retry → same order</span>}
                      {order?.dry_run && <span className="chip warn">DRY_RUN · not sent to kitchen</span>}
                    </div>
                  </div>
                  <ul>
                    {plan.line_details?.map((l: any) => (
                      <li key={l.item_id}>
                        <span>
                          {l.quantity} × {l.name}
                        </span>
                        <span>{dollars(l.line_total)}</span>
                      </li>
                    ))}
                    {quote.fees?.map((f: any) => (
                      <li key={f.code}>
                        <span>{f.label}</span>
                        <span>{dollars(f.amount)}</span>
                      </li>
                    ))}
                    <li>
                      <span>HST</span>
                      <span>{dollars(quote.tax)}</span>
                    </li>
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="demo-foot">
        <span>
          {state === "done"
            ? `${calls} tool calls · ${totalMs} ms of server time · order ${order?.order_id}`
            : "Tap any tool call to see the exact JSON the agent received."}
        </span>
        {state === "done" && (
          <button className="pill ghost" style={{ padding: "8px 16px", fontSize: 14 }} onClick={run}>
            Run again
          </button>
        )}
      </div>
    </div>
  );
}

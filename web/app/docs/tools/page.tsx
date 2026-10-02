import type { Metadata } from "next";
import { z } from "zod";
import { DocNext } from "@/components/DocNext";
import { ErrorCode } from "@/lib/orderable/schema";
import { tools } from "@/lib/orderable/tools";

export const metadata: Metadata = { title: "Tools & errors · Orderable Docs" };

type Schema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  items?: Schema;
  anyOf?: Schema[];
  properties?: Record<string, Schema>;
  required?: string[];
  description?: string;
  additionalProperties?: Schema | boolean;
  propertyNames?: Schema;
};

/** Short human type label from a JSON Schema node. */
function typeLabel(s: Schema): string {
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (s.anyOf) return s.anyOf.map(typeLabel).join(" | ");
  if (s.type === "array") return `${s.items ? typeLabel(s.items) : "any"}[]`;
  if (s.type === "object" && s.properties) return `{ ${Object.keys(s.properties).join(", ")} }`;
  if (s.type === "object" && s.propertyNames?.enum) return `{ ${s.propertyNames.enum.join(", ")} } → number`;
  if (s.type === "object") return "object";
  if (Array.isArray(s.type)) return s.type.join(" | ");
  return s.type ?? "any";
}

const ERROR_MEANING: Record<z.infer<typeof ErrorCode>, string> = {
  QUOTE_EXPIRED: "The quote is older than 10 minutes. Quote again.",
  QUOTE_NOT_FOUND: "No such quote. Orders need a quote from quote_order.",
  QUOTE_ALREADY_USED: "This quote already became an order; details.order_id has it.",
  ITEM_SOLD_OUT: "Sold out, or fewer left than requested (details.problems[].available_quantity).",
  ITEM_NOT_FOUND: "The item doesn't exist at that location.",
  ITEM_UNAVAILABLE: "The item isn't offered for that fulfillment mode.",
  INVALID_MODIFIERS: "Missing or unknown modifier choices; the message lists them.",
  MINIMUM_NOT_MET: "Below the delivery minimum.",
  OUTSIDE_DELIVERY_ZONE: "The address is outside the location's delivery zone.",
  CLOSED: "Closed at that time; details.next_open_at and suggested_desired_time help.",
  LEAD_TIME_NOT_MET: "Needs more notice (e.g. cakes); details include earliest_time.",
  POLICY_BLOCKED: "The spending policy blocks it; details.violations explains. Don't work around it.",
  PRICE_CHANGED: "Prices moved since the quote. Quote again and reconfirm the total.",
  LOCATION_NOT_FOUND: "No such location. Call list_locations.",
  FULFILLMENT_UNAVAILABLE: "The location doesn't offer that mode.",
  ORDER_NOT_FOUND: "No such order.",
  CANCELLATION_WINDOW_CLOSED: "Too late to cancel; details include the store phone.",
  IDEMPOTENCY_KEY_REUSED: "The key was used for a different quote. Use a new key.",
  INVALID_REQUEST: "Something in the request is wrong; the message says what.",
  ADAPTER_ERROR: "The merchant's system failed or rejected the request.",
};

export default function Tools() {
  return (
    <>
      <h1>Tools &amp; errors</h1>
      <p className="lead">
        Nine tools, generated from the server's own schemas, so this page always matches the code. Every successful result includes a{" "}
        <code>next_step</code> hint; every error includes a <code>code</code> and <code>suggested_next_tool</code>.
      </p>
      <p>
        Jump to: {tools.map((t, i) => (
          <span key={t.name}>
            {i > 0 && " · "}
            <a href={`#${t.name}`}>{t.name}</a>
          </span>
        ))}{" "}
        · <a href="#errors">errors</a> · <a href="#resources">resources</a>
      </p>

      {tools.map((t) => {
        const schema = z.toJSONSchema(z.object(t.input as z.ZodRawShape), { io: "input" }) as Schema;
        const required = new Set(schema.required ?? []);
        const props = Object.entries(schema.properties ?? {});
        return (
          <section key={t.name} id={t.name} className="tool-doc">
            <h2>
              <code>{t.name}</code>
            </h2>
            <p className="desc">
              {t.description.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}
            </p>
            <p>
              {t.annotations.readOnlyHint ? "Read-only." : t.annotations.destructiveHint ? "Changes state (destructive)." : "Changes state."}{" "}
              {t.annotations.idempotentHint ? "Safe to retry." : ""}
            </p>
            {props.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Type</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {props.map(([name, p]) => (
                    <tr key={name}>
                      <td>
                        <code>{name}</code>
                        {required.has(name) && <span className="req">required</span>}
                      </td>
                      <td>
                        <code>{typeLabel(p)}</code>
                      </td>
                      <td>{p.description ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}

      <section id="errors" className="tool-doc">
        <h2>Errors</h2>
        <p>Errors come back as an MCP tool error whose text content is JSON:</p>
        <pre>
          <code>{`{
  "error": {
    "code": "LEAD_TIME_NOT_MET",
    "message": "Chocolate Celebration Cake (8 in) needs 48h notice. Earliest: 2026-10-09T13:00:00.000Z",
    "suggested_next_tool": "check_availability",
    "details": { "problems": [{ "item_id": "crumb-chocolate-cake", "earliest_time": "2026-10-09T13:00:00.000Z" }] }
  }
}`}</code>
        </pre>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {ErrorCode.options.map((code) => (
              <tr key={code}>
                <td>
                  <code>{code}</code>
                </td>
                <td>{ERROR_MEANING[code]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="resources" className="tool-doc">
        <h2>Resources</h2>
        <ul>
          <li>
            <code>orderable://menu/{"{location_id}"}</code>: the full menu with modifiers, allergens and availability.
          </li>
          <li>
            <code>orderable://policies</code>: cancellation, refund, payment and delivery fees, plus the agent spending policy and ordering rules.
          </li>
        </ul>
      </section>
      <DocNext from="/docs/tools" />
    </>
  );
}

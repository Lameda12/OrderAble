import type { Metadata } from "next";
import { DocNext } from "@/components/DocNext";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Docs · Orderable", description: "Run Orderable, connect an agent, and make a food business orderable." };

export default function Quickstart() {
  return (
    <>
      <h1>Quickstart</h1>
      <p className="lead">
        Orderable is an MCP server that makes a food business orderable by AI agents. Run it in a minute, point an agent at it, and it can browse the
        menu, check what's in stock, quote, order and track.
      </p>

      <h2>1. Run it</h2>
      <pre>
        <code>{`git clone ${SITE.github} && cd OrderAble
npm install
node dist/cli.js serve --stdio --adapter mock`}</code>
      </pre>
      <p>
        That serves two fictional Halifax businesses, Crumb &amp; Co (bakery) and Northline Coffee (cafe). Requires Node 20 or newer.
      </p>

      <h2>2. Look inside</h2>
      <pre>
        <code>npx @modelcontextprotocol/inspector node dist/cli.js serve --stdio --adapter mock</code>
      </pre>
      <p>The MCP Inspector lists the nine tools and two resources and lets you call them by hand.</p>

      <h2>3. Connect an agent</h2>
      <pre>
        <code>claude mcp add orderable -e ORDERABLE_ADAPTER=mock -- node /absolute/path/to/OrderAble/dist/cli.js serve --stdio</code>
      </pre>
      <p>
        Then ask Claude: <em>"Plan lunch for 12 tomorrow at noon, 3 vegetarians, 1 gluten-free, under $20 a head."</em> Other clients are covered in{" "}
        <a href="/docs/connect">Connect a client</a>.
      </p>

      <h2>4. Make it yours</h2>
      <pre>
        <code>{`node dist/cli.js init       # writes menu.yaml for your business type
node dist/cli.js validate   # plain-English errors with line numbers
node dist/cli.js doctor     # agent-readiness score out of 100
node dist/cli.js serve --stdio`}</code>
      </pre>

      <h2>How an order flows</h2>
      <ol>
        <li>
          <code>list_locations</code> finds where to order and whether it delivers to you.
        </li>
        <li>
          <code>search_menu</code> or <code>plan_group_order</code> picks items; <code>get_item</code> gives modifiers and allergens.
        </li>
        <li>
          <code>quote_order</code> prices the cart and locks it for 10 minutes.
        </li>
        <li>
          The customer approves the total, then <code>place_order</code> runs with an idempotency key and <code>confirm: true</code>.
        </li>
        <li>
          <code>get_order_status</code> tracks it; <code>cancel_order</code> works inside the merchant's window.
        </li>
      </ol>

      <h2>Rules every response follows</h2>
      <ul>
        <li>Money is integer minor units with a currency: <code>{`{ "amount": 1295, "currency": "CAD" }`}</code> is $12.95.</li>
        <li>
          Anything with prices or stock carries <code>as_of</code> and <code>ttl_seconds</code>. Past the ttl, re-check.
        </li>
        <li>
          Allergens are <code>contains</code>, <code>may_contain</code> or <code>unknown</code>. Unknown is never safe.
        </li>
        <li>
          <code>DRY_RUN</code> is on by default: orders are recorded but not sent to the kitchen until the owner turns it off.
        </li>
      </ul>
      <DocNext from="/docs" />
    </>
  );
}

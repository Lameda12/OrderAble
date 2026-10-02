import type { Metadata } from "next";
import { DocNext } from "@/components/DocNext";

export const metadata: Metadata = { title: "For owners · Orderable Docs" };

export default function Owners() {
  return (
    <>
      <h1>For owners</h1>
      <p className="lead">One file describes your business. Three commands keep it honest.</p>

      <h2>Set up by talking to your assistant</h2>
      <p>
        You don't need to write any files. Connect Orderable to Claude Desktop in owner mode, then tell Claude about your business the way you'd
        tell a new employee. Paste your menu, or attach a photo of it.
      </p>
      <pre>
        <code>{`{
  "mcpServers": {
    "orderable": {
      "command": "node",
      "args": ["/path/to/OrderAble/dist/cli.js", "serve", "--stdio", "--owner"],
      "env": { "ORDERABLE_ADAPTER": "file", "ORDERABLE_MENU": "/path/to/menu.yaml" }
    }
  }
}`}</code>
      </pre>
      <p>Then, in Claude:</p>
      <pre>
        <code>{`Set up my bakery on Orderable. We're Rosie's Bakeshop, 2500 Agricola St,
Halifax. Open Tue to Fri 7 to 5, weekends 8 to 3, closed Mondays.
Pickup only for now. Here's the menu: [photo]`}</code>
      </pre>
      <p>
        Claude reads the menu and saves it through Orderable's owner tools. Orderable checks everything before saving, and tells Claude what's
        still missing, so it asks you about things it can't see, like allergens, instead of guessing. Later, "out of croissants" or "raise the
        latte to $5.50" works the same way.
      </p>
      <p>
        Owner tools only appear in owner mode (<code>--owner</code>, or the separate <code>ORDERABLE_OWNER_TOKEN</code> over HTTP). Customers'
        agents never see them.
      </p>

      <h2>Hosted: two links, nothing to install</h2>
      <p>
        On a hosted account you get two private links. Paste the owner link into Claude (Settings, Connectors, add custom connector) and set up
        by talking, as above. Share the agent link with customers' agents. Each restaurant's menu and orders are kept apart, links are stored
        only as hashes, and a lost link can be replaced. New accounts start in test mode until you switch them live.
      </p>
      <p>
        Running it yourself? Point <code>DATABASE_URL</code> at Postgres (we use Neon, pooled connection string), then run{" "}
        <code>orderable accounts migrate</code> and <code>orderable accounts create &quot;Your Bakery&quot;</code>.
      </p>

      <h2>Prefer a file?</h2>
      <pre>
        <code>orderable init</code>
      </pre>
      <p>
        Pick restaurant, cafe, bakery or delivery and answer a few questions. You get <code>menu.yaml</code> with examples that fit: bakeries get
        lead-time cakes and a daily sell-out item, cafes get drink modifiers, restaurants get catering trays. You also get{" "}
        <code>orderable.config.yaml</code> with DRY_RUN on.
      </p>

      <h2>menu.yaml</h2>
      <pre>
        <code>{`items:
  - id: chocolate-cake
    name: Chocolate Celebration Cake (8 in)
    category: cakes
    price: 58.00            # dollars
    serves: 12
    lead_time: 48h          # agents won't promise it sooner
    dietary: [vegetarian]
    allergens:
      contains: [wheat, gluten, milk, egg, soy]
      may_contain: [tree_nut, peanut]
    stock: in_stock         # or { status: low, quantity: 6 }
stock_updated_at: live      # or a timestamp`}</code>
      </pre>
      <ul>
        <li>Hours are <code>"07:00-18:00"</code>, <code>"07:00-11:00, 12:00-18:00"</code> or <code>closed</code>.</li>
        <li>Delivery zones are <code>postal_codes: [B3H, B3J]</code> or <code>radius_km</code> with lat/lng on the address.</li>
        <li>Allergens you don't list are reported as <code>unknown</code>, never as safe.</li>
        <li>The server reloads the file when you save it, so updating stock is just editing a line.</li>
      </ul>

      <h2>Check it</h2>
      <pre>
        <code>{`$ orderable validate
✗ error   menu.yaml:76  Country Sourdough is in category "bread", which isn't defined under categories:.
! warning menu.yaml:54  Butter Croissant has no allergen info, agents will treat it as unknown.`}</code>
      </pre>
      <pre>
        <code>{`$ orderable doctor
  Agent readiness  94/100
  ~ Allergen coverage        21/25
  ✓ Stock tracked            15/15
  ✓ Quote-to-order flow      20/20
  Top fixes
  1. Add allergens to Seasonal Fruit Galette… (+4)`}</code>
      </pre>

      <h2>Update stock by text</h2>
      <p>Text the Orderable bot on Telegram or Slack, or type it at the terminal. No app, no file editing:</p>
      <pre>
        <code>{`out of butter croissants
6 morning buns left
sourdough is back
running low on lattes
86 the soup at Quinpool`}</code>
      </pre>
      <p>
        If a message matches more than one item, Orderable asks which one and changes nothing. Changes are written into <code>menu.yaml</code> and
        agents see them right away. Only people you allow-list can do this:
      </p>
      <pre>
        <code>{`ORDERABLE_OWNER_TELEGRAM_IDS=123456789      # your Telegram user id
ORDERABLE_OWNER_SLACK_IDS=U0123ABCD         # your Slack member id
orderable stock "out of butter croissants"  # same thing, from a terminal`}</code>
      </pre>

      <h2>Spending limits and safety</h2>
      <pre>
        <code>{`# orderable.config.yaml
dry_run: true               # flip to false when you're ready for real orders
payment:
  methods: [pay_at_pickup, invoice]
policy:
  max_order_total: 500      # dollars, tax included
  max_daily_total: 2000
  max_headcount: 60`}</code>
      </pre>
      <p>Agents see the policy in every quote. Blocked orders return <code>POLICY_BLOCKED</code> with the reason. Card details never pass through Orderable.</p>
      <DocNext from="/docs/owners" />
    </>
  );
}

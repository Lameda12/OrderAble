import type { Metadata } from "next";
import { DocNext } from "@/components/DocNext";

export const metadata: Metadata = { title: "For owners · Orderable Docs" };

export default function Owners() {
  return (
    <>
      <h1>For owners</h1>
      <p className="lead">One file describes your business. Three commands keep it honest.</p>

      <h2>Create your menu</h2>
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

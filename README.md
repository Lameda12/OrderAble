# Orderable

**Make any food business orderable by AI agents.**

Ordering is moving from screens to tool calls. DoorDash already ships an MCP server so agents in Claude or Slack can order team lunch without anyone opening an app. Aggregators can afford that. The independent bakery, the three-location cafe, the local delivery outfit can't, and they're about to become invisible to agents. Orderable is an open-source [MCP](https://modelcontextprotocol.io) server any food business can run (or have a dev run for them) that exposes its catalog, prices, live availability, ordering, and order tracking to any MCP-capable agent. Agents don't care about banners or loyalty points. They check three things: is availability accurate, does checkout work, does this fit the customer's spending policy. Orderable is built for exactly that: timestamped, machine-checkable data, quotes that lock prices, idempotent ordering, and honest allergens.

Built for B2B and office ordering first (team lunch, catering, recurring pantry orders), and for people ordering through their own agent.

**Live demo:** [orderable-mcp.vercel.app](https://orderable-mcp.vercel.app) · **Docs:** [orderable-mcp.vercel.app/docs](https://orderable-mcp.vercel.app/docs) · **Transcript:** [examples/team-lunch.md](examples/team-lunch.md)

---

## Plans

| | Open source | Free (hosted) | Pro (API) |
| --- | --- | --- | --- |
| Price | $0, MIT, forever | $0, up to 50 orders/month | $0.25 per completed order |
| Runs on | Your machine or cloud | Orderable cloud | Orderable cloud |
| MCP endpoint | Self-hosted | Hosted | Hosted |
| Chat apps | Telegram, Slack (self-run bots) | Telegram, Slack, connected for you | Same, plus new channels as they ship |
| Locations | Unlimited | 1 | Unlimited |

No commission on any plan: customers pay the business directly. Hosted plans are in early access ([request it](https://github.com/Lameda12/OrderAble/issues/new?title=Early%20access&labels=early-access)).

**Channels:** MCP, Telegram and Slack are live. WhatsApp and iMessage are coming soon.

## 60-second quickstart

```bash
git clone https://github.com/Lameda12/OrderAble && cd OrderAble
npm install            # builds to dist/
node dist/cli.js serve --stdio --adapter mock
```

That's a working server with two seeded Halifax businesses (Crumb & Co bakery, Northline Coffee). Poke at it in the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/cli.js serve --stdio --adapter mock
```

Now make it yours:

```bash
node dist/cli.js init        # wizard: restaurant | cafe | bakery | delivery → menu.yaml
node dist/cli.js validate    # plain-English errors with line numbers
node dist/cli.js doctor      # agent-readiness score out of 100 + top 3 fixes
node dist/cli.js serve --stdio
```

`npm link` puts `orderable` on your PATH so you can drop the `node dist/cli.js`. (The npm package name will be `orderable-mcp`; `orderable` on npm is an unrelated project.)

## Connect an agent

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "orderable": {
      "command": "node",
      "args": ["/absolute/path/to/OrderAble/dist/cli.js", "serve", "--stdio"],
      "env": {
        "ORDERABLE_ADAPTER": "mock",
        "ORDERABLE_DB": "/absolute/path/to/orderable.db"
      }
    }
  }
}
```

Use `"ORDERABLE_ADAPTER": "file"` and `"ORDERABLE_MENU": "/path/to/menu.yaml"` for your own menu.

**Claude Code:**

```bash
claude mcp add orderable -e ORDERABLE_ADAPTER=mock -- node /absolute/path/to/OrderAble/dist/cli.js serve --stdio
```

**Hosted (Streamable HTTP):** requires a bearer token. Without `ORDERABLE_TOKEN`, one is generated and printed.

```bash
ORDERABLE_TOKEN=change-me node dist/cli.js serve --http --port 3333
claude mcp add --transport http orderable http://127.0.0.1:3333/mcp --header "Authorization: Bearer change-me"
```

`GET /health` reports version, adapter and dry-run state. The HTTP handler is built on web-standard `Request`/`Response` (`createHttpHandler` from `orderable-mcp/mcp`), so it also runs on Vercel, Cloudflare Workers or Deno. The [demo site](web/) does exactly that.

## Tools

Every response carrying prices or availability includes `as_of` and `ttl_seconds`. Money is always integer minor units with an explicit currency. Every successful result carries a `next_step` hint; every error carries a `code` and `suggested_next_tool`.

| Tool | Use it to | Key inputs | Returns |
| --- | --- | --- | --- |
| `list_locations` | Start here. Find locations near the customer | `near` {lat,lng}, `postal_code`, `fulfillment` | Locations with hours, `open_now`, `next_open_at`, `distance_km`, `delivers_to_you` |
| `search_menu` | Find items with live availability | `location_id`, `query`, `dietary[]`, `exclude_allergens[]`, `max_price`, `category`, `desired_time` | Items with price, allergens (contains / may_contain / unknown), modifiers, lead time, availability |
| `get_item` | Full detail before quoting or for allergies | `item_id` | Item, complete allergen map, required modifier groups, availability per location |
| `check_availability` | Can these items be ready at that time? | `location_id`, `item_ids[]`, `desired_time`, `fulfillment`, `quantities` | Per item: `orderable`, `earliest_time`, `reason`, `stale` |
| `plan_group_order` | Feed a group within an all-in budget | `location_id`, `headcount`, `budget_per_person`, `dietary_requirements` {vegetarian: 3, …}, `desired_time` | Cart `lines` ready for `quote_order`, per-line coverage, estimate, unmet constraints, warnings |
| `quote_order` | Price and lock a cart for 10 minutes | `location_id`, `lines[]`, `fulfillment`, `desired_time`, `delivery_address`, `headcount` | `quote_id`, itemized subtotal, fees, tax, total, ETA, `expires_at`, policy check |
| `place_order` | Turn a quote into an order | `quote_id`, `idempotency_key`, `customer`, `confirm: true`, `payment_method` | Order, `idempotent_replay`, payment instructions (never card data) |
| `get_order_status` | Track an order | `order_id` | Status, timestamped timeline, ETA, `cancellable_until` |
| `cancel_order` | Cancel within the merchant's window | `order_id`, `reason` | Result and timeline |

**Resources:** `orderable://menu/{location_id}` (full menu with availability) and `orderable://policies` (cancellation, refund, payment, delivery fees, the agent spending policy, and ordering rules), readable without tool calls.

**Error codes:** `QUOTE_EXPIRED`, `QUOTE_NOT_FOUND`, `QUOTE_ALREADY_USED`, `PRICE_CHANGED`, `ITEM_SOLD_OUT`, `ITEM_NOT_FOUND`, `ITEM_UNAVAILABLE`, `INVALID_MODIFIERS`, `MINIMUM_NOT_MET`, `OUTSIDE_DELIVERY_ZONE`, `CLOSED`, `LEAD_TIME_NOT_MET`, `POLICY_BLOCKED`, `LOCATION_NOT_FOUND`, `FULFILLMENT_UNAVAILABLE`, `ORDER_NOT_FOUND`, `CANCELLATION_WINDOW_CLOSED`, `IDEMPOTENCY_KEY_REUSED`, `INVALID_REQUEST`, `ADAPTER_ERROR`.

```json
{
  "error": {
    "code": "LEAD_TIME_NOT_MET",
    "message": "Chocolate Celebration Cake (8 in) needs 48h notice. Earliest: 2026-10-09T13:00:00.000Z",
    "suggested_next_tool": "check_availability",
    "details": { "problems": [{ "item_id": "crumb-chocolate-cake", "earliest_time": "2026-10-09T13:00:00.000Z" }] }
  }
}
```

## Safety and trust

- **No ad-hoc ordering.** `place_order` only accepts a valid, unexpired, unused quote. Stock, prices and policy are re-checked at order time (`ITEM_SOLD_OUT`, `PRICE_CHANGED`, `POLICY_BLOCKED`).
- **Idempotent.** Same `idempotency_key` + quote returns the original order (`idempotent_replay: true`), including under concurrent retries. A key reused for a different quote is rejected.
- **Spending policy** in `orderable.config.yaml`: per-order cap, per-day cap, allowed locations, max headcount. Quotes show the policy result up front; blocked orders return machine-readable violations.
- **`DRY_RUN` is on by default.** Orders are recorded in SQLite but never sent to the adapter until the owner sets `dry_run: false` (or `DRY_RUN=false`).
- **No card data, ever.** Payment is pay at pickup, invoice/account billing for B2B, or a merchant-hosted payment link.
- **Allergens are tri-state** (`contains` / `may_contain` / `unknown`) for every major allergen. Missing data is `unknown`, never "safe". `plan_group_order` flags shared-kitchen risk (e.g. gluten-free by recipe, may contain gluten).
- **HTTP needs a bearer token** (constant-time compare). stdio doesn't.

## Chat apps: Telegram and Slack

Customers and teams can order from inside the chat apps they already use. Orderable ships a Claude-powered ordering assistant (`src/agent.ts`) that calls the same nine MCP tools through a real MCP client, so every rule (quotes, policy caps, DRY_RUN, idempotency, honest allergens) applies in chat exactly as it does in Claude Desktop. It confirms the total before placing anything and asks for missing contact details instead of inventing them.

| Surface | How it connects | Run it |
| --- | --- | --- |
| **Telegram** | Bot via @BotFather. DMs or groups. `/start`, `/reset` | `orderable bot telegram` (long polling, no public URL) or the `/api/telegram` webhook on Vercel |
| **Slack** | Slack app. @mention it in a channel (answers in a thread), DM it, or `/order …` | `orderable bot slack` (HTTP) or `/api/slack/events` on Vercel |
| **Claude in Slack, claude.ai, any MCP client** | Add Orderable as a remote MCP connector | `https://<host>/api/mcp/<ORDERABLE_TOKEN>` |

All bots need `ANTHROPIC_API_KEY`. The agent uses `claude-opus-5-5` at `medium` effort with server-side refusal fallback enabled; override with `ORDERABLE_AGENT_MODEL` and `ORDERABLE_AGENT_EFFORT`. Conversation history is kept per chat (per thread in Slack channels) in memory, and starts fresh after 2 idle hours or when it gets long.

### Telegram

1. Message [@BotFather](https://t.me/BotFather), send `/newbot`, copy the token.
2. Run it locally (polling, nothing to expose):

   ```bash
   TELEGRAM_BOT_TOKEN=123:abc ANTHROPIC_API_KEY=sk-ant-... node dist/cli.js bot telegram --adapter mock
   ```

3. Or on Vercel: set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (any random string) and `ANTHROPIC_API_KEY` on the project, then register the webhook once:

   ```bash
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d url=https://orderable-mcp.vercel.app/api/telegram \
     -d secret_token=$TELEGRAM_WEBHOOK_SECRET
   ```

### Slack

1. Get a manifest with your URLs filled in: `node dist/cli.js bot slack-manifest https://your-host` (self-hosted) or open `https://<vercel-host>/api/slack/manifest`.
2. [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From a manifest → paste it → Install to Workspace.
3. Copy the **Bot User OAuth Token** (`xoxb-…`) and **Signing Secret**, then either:

   ```bash
   SLACK_BOT_TOKEN=xoxb-... SLACK_SIGNING_SECRET=... ANTHROPIC_API_KEY=sk-ant-... \
     node dist/cli.js bot slack --port 3334   # expose /slack/events and /slack/commands publicly
   ```

   or set the same three variables on the Vercel project (endpoints `/api/slack/events` and `/api/slack/commands`).

Requests are verified with Slack's signing secret (5-minute replay window), acknowledged inside Slack's 3-second limit, and deduplicated by event id. Scopes: `app_mentions:read`, `chat:write`, `commands`, `im:history`, `reactions:write`, `users:read` (used to pre-fill the customer's name).

### As an MCP connector (Claude in Slack, claude.ai, Cursor, …)

Clients that only take a URL can put the token in the path: `https://<host>/mcp/<ORDERABLE_TOKEN>` for `orderable serve --http`, or `https://<vercel-host>/api/mcp/<token>` on the site. Treat that URL as a secret. The public demo is `https://orderable-mcp.vercel.app/api/mcp/orderable-demo` (fake businesses, DRY_RUN on).

## For owners: menu.yaml

Owners aren't developers, so the menu file uses dollars, `"07:00-18:00"` hours, `"48h"` lead times and two short allergen lists. `orderable init` writes a starter file with examples for your business type: bakeries get lead-time cakes and a daily sell-out item, cafes get drink modifiers, restaurants get catering trays.

```yaml
items:
  - id: chocolate-cake
    name: Chocolate Celebration Cake (8 in)
    category: cakes
    price: 58.00
    serves: 12
    lead_time: 48h          # agents won't promise it sooner
    dietary: [vegetarian]
    allergens:
      contains: [wheat, gluten, milk, egg, soy]
      may_contain: [tree_nut, peanut]
    stock: in_stock         # or { status: low, quantity: 6 }
stock_updated_at: live      # or a timestamp; agents drop stale merchants
```

```
$ orderable validate
✗ error   menu.yaml:76  Country Sourdough is in category "bread", which isn't defined under categories:.
! warning menu.yaml:54  Butter Croissant has no allergen info, agents will treat it as unknown.

$ orderable doctor
  Agent readiness  94/100
  ~ Allergen coverage        21/25  31/37 items declare allergens
  ✓ Stock tracked            15/15  37/37 items have a stock status
  ✓ Availability freshness   10/10  Stock data is fresh
  ✓ Opening hours            15/15  4/4 locations have hours
  ✓ Delivery zones           10/10  2/2 delivery locations have a checkable zone
  ✓ Quote-to-order flow      20/20  Quoted and placed a dry-run order for Butter Croissant
  ~ Item descriptions         3/5   19/37 items have a description
  Top fixes
  1. Add allergens to Seasonal Fruit Galette, … (+4)
```

The file adapter hot-reloads `menu.yaml` when it changes, so updating stock is just saving the file.

## Architecture

```
src/
  server.ts        Node entry points: stdio + HTTP, adapter/store wiring
  mcp.ts           Transport-agnostic MCP server: tools, resources, web-standard HTTP handler
  service.ts       Ordering engine: hours, lead times, zones, stock, quotes, policy, idempotency
  schema.ts        Canonical domain model (Zod)
  tools/           One file per tool (input + output Zod schemas, LLM-facing descriptions)
  adapters/
    types.ts       Adapter interface
    local.ts       Shared base for catalog-backed adapters (simulated order lifecycle)
    file.ts        menu.yaml adapter (default)
    mock.ts        Seeded Crumb & Co + Northline Coffee
    square.ts      Square (v0.2, experimental: locations + catalog read; ordering TODO)
  policy.ts        Spending limits and checks
  store.ts         SQLite persistence (better-sqlite3); store-memory.ts for serverless
  lint.ts          `validate` rules
  doctor.ts        `doctor` scoring
  agent.ts         Claude chat agent that orders through the MCP tools
  channels/        telegram.ts (webhook + polling), slack.ts (events, /order, manifest)
  cli.ts           orderable init | validate | doctor | serve | bot
```

## Writing an adapter

An adapter translates between a POS and the canonical model. Orderable handles quoting rules, hours, lead times, zones, policy, idempotency and persistence, so an adapter stays small. Implement `Adapter` from `src/adapters/types.ts`:

```ts
interface Adapter {
  readonly name: string;
  listBusinesses(): Promise<Business[]>;
  listLocations(): Promise<Location[]>;
  getMenu(locationId: string): Promise<Menu>;
  getItem(itemId: string): Promise<Item | null>;
  getAvailability(locationId: string, itemIds: string[]): Promise<StockLevel[]>;
  quote(req: PricingRequest): Promise<PricingResult>;          // price + validate modifiers
  placeOrder(req: AdapterOrderRequest): Promise<AdapterOrderResult>;
  getOrderStatus(externalId: string, order: Order): Promise<AdapterOrderStatus>;
  cancelOrder(externalId: string, reason: string, order: Order): Promise<{ cancelled: boolean; message?: string }>;
}
```

Guidelines:

1. **Map, don't invent.** If the POS has no allergen data, return `allergenMap(undefined)` (all `unknown`). If it doesn't track stock, return `status: "unknown"`.
2. **Be honest about freshness.** `as_of` is when the POS last confirmed the data, not when you read it from a cache.
3. **Money in minor units.** Most POS APIs already are (Square's `amount` is cents).
4. **Throw `OrderableError`** for expected failures (`ITEM_NOT_FOUND`, `INVALID_MODIFIERS`); anything else becomes `ADAPTER_ERROR`.
5. **Use the Orderable `order_id` as the POS idempotency key** in `placeOrder`, so a retried send never duplicates on the POS side either.
6. Catalog-backed sources can extend `LocalCatalogAdapter` and only supply a `Catalog`. `resolveModifiers` and `computeTotals` in `pricing.ts` are reusable.
7. Register it in `createAdapter` (`src/server.ts`) and add a test that runs the quote → order happy path against it.

## Development

```bash
npm test            # vitest: 63 tests (schema, ordering, idempotency, policy, group orders, MCP surface, HTTP auth, file adapter, CLI rules, chat agent, Telegram, Slack)
npm run typecheck
npm run example     # regenerate examples/team-lunch.md from a real run
npm run inspect     # MCP Inspector against the mock adapter
```

The demo site lives in [`web/`](web/) (Next.js, deployed on Vercel), with docs at `/docs` (the tool reference is generated from the server's schemas) and legal pages at `/terms`, `/privacy`, `/refunds`, `/cookies`, `/accessibility` and `/contact`. Business details for those pages are in `web/lib/site.ts`. It runs the real server in a serverless function: `/api/mcp` is a live Streamable HTTP endpoint backed by the mock adapter (demo token is printed on the site) and `/api/demo` runs the team-lunch scenario end to end.

## Roadmap

- **v0.2 adapters:** Square (finish orders/inventory), Toast, Clover, Shopify, Lightspeed
- **Recurring orders:** "every Friday, lunch for the team" with a standing spending policy
- **Webhooks:** push order status to the agent instead of polling (and proactively to Telegram/Slack chats)
- **WhatsApp and iMessage** (soon), then Microsoft Teams and SMS
- **Courier delivery for agent orders** (flat fee per trip, no commission): Uber Direct, then DoorDash Drive in North America; Wolt Drive in Europe; GrabExpress in Southeast Asia
- **Hosted Free and Pro plans:** managed MCP endpoint, connected chat apps, usage-based API
- **Substitutions:** let `plan_group_order` propose swaps when an item sells out after quoting
- **Multi-merchant group orders:** split one team order across two nearby locations
- **Owner dashboard:** a tiny web UI for updating stock from a phone

## License

MIT

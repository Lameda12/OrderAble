import { OrderableAgent } from "./orderable/agent";
import { MockAdapter } from "./orderable/adapters/mock";
import { defaultConfig } from "./orderable/config";
import { createHttpHandler } from "./orderable/mcp";
import { resolvePolicy } from "./orderable/policy";
import { OrderableService } from "./orderable/service";
import { MemoryStore } from "./orderable/store-memory";

/** Public demo token. The endpoint only serves fake businesses, with DRY_RUN on. */
export const DEMO_TOKEN = "orderable-demo";

export function demoService() {
  return new OrderableService({
    adapter: new MockAdapter(),
    store: new MemoryStore(),
    config: defaultConfig({
      dry_run: true,
      policy: resolvePolicy({ timezone: "America/Halifax", max_order_total: 1000, max_headcount: 100 }),
      payment: {
        methods: ["pay_at_pickup", "invoice", "payment_link"],
        payment_link_template: "https://pay.example.com/checkout/{order_id}",
        invoice_terms: "Net 30",
      },
    }),
  });
}

// One warm instance keeps quotes between calls; a cold start begins fresh (it's a demo).
const g = globalThis as unknown as { __orderable?: (req: Request) => Promise<Response> };
export const mcpHandler = () => (g.__orderable ??= createHttpHandler(demoService(), DEMO_TOKEN));

// ---------------------------------------------------------------- chat bots

const bots = globalThis as unknown as { __orderableAgent?: OrderableAgent };

/** Claude-powered agent shared by the Telegram and Slack webhooks. Needs ANTHROPIC_API_KEY. */
export const chatAgent = () => (bots.__orderableAgent ??= new OrderableAgent({ service: demoService() }));

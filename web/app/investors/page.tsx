import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Investors and partners · Orderable",
  description: "Where Orderable stands today, what it would do next, and how to help.",
};

const STATUS: [string, string, "done" | "zero" | "planned"][] = [
  ["MCP server: 9 tools, menu and policy resources, stdio and HTTP", "Shipped, MIT licensed", "done"],
  ["Owner command line: setup, menu checker, readiness score", "Shipped", "done"],
  ["Telegram and Slack ordering bots (Claude)", "Shipped, not yet run with real customers", "done"],
  ["Menu setup by talking to an AI assistant", "Shipped, tested with an MCP client", "done"],
  ["Stock updates by text message", "Shipped", "done"],
  ["Hosted accounts: one secret URL for the owner, one for agents, Postgres", "Shipped, not yet in production", "done"],
  ["Automated tests", "91 passing", "done"],
  ["Restaurants live", "0", "zero"],
  ["Paying customers", "0", "zero"],
  ["Revenue", "$0", "zero"],
  ["Self-serve sign-up and billing", "Designed, not built", "planned"],
  ["Courier delivery (Uber Direct first)", "Researched, not built", "planned"],
];

export default function Investors() {
  return (
    <>
      <Nav />
      <main id="content" className="prose-page">
        <article className="prose investors">
          <p className="kicker">Investors and partners</p>
          <h1>Orderable is early. Here's exactly where it is.</h1>
          <p className="intro">
            We're not running a fundraise. If you care about independent restaurants staying reachable as people start ordering through AI agents,
            a small amount of help goes a long way right now. This page should give you enough to decide in five minutes.
          </p>

          <h2>What's changing</h2>
          <p>
            People are starting to hand ordering to AI agents. In September 2026 DoorDash opened an{" "}
            <a href="https://developer.doordash.com/en-US/docs/mcp/overview/about_mcp/">MCP connector</a> that lets workplace agents search, build a
            cart and order lunch for a team, with companies like SpaceX, Cognition and Vercel as early users (
            <a href="https://www.digitalcommerce360.com/2026/10/01/doordash-expands-access-to-agentic-ordering-for-offices-corporate-customers/amp/">
              Digital Commerce 360
            </a>
            ). An agent can only order from businesses it can reach. Today that mostly means businesses on a delivery platform.
          </p>

          <h2>What Orderable does</h2>
          <p>
            Orderable is open-source software a restaurant, cafe or bakery runs to make itself orderable by any agent: menu, live stock, prices, a
            quote that holds for ten minutes, and the order itself. The restaurant keeps the customer and takes payment directly. When it needs a
            driver, the plan is to book one per trip through courier services like Uber Direct, which charge a flat fee rather than a share of the
            order.
          </p>

          <h2>Where it stands, October 2026</h2>
          <table className="status">
            <tbody>
              {STATUS.map(([what, state, kind]) => (
                <tr key={what}>
                  <td>{what}</td>
                  <td className={`state ${kind}`}>{state}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Everything above is public. Read the <a href={SITE.github}>code</a>, run the <a href="/#demo">live demo</a>, or connect your own agent
            to the <a href="/docs/connect">demo endpoint</a>.
          </p>

          <h2>How it makes money</h2>
          <p>
            The software stays free and open source. The business is the hosted version: we run the server, connect the chat apps and couriers, and
            charge the restaurant a flat $29 a month after a free tier of 50 orders, with 1,000 orders included and $0.05 per order after that.
            Cancelled orders cost nothing. A flat price is easy to compare with delivery-app commissions. These prices are a starting point, not
            something customers have paid yet, and we're measuring what each order costs us to run before we fix them.
          </p>

          <h2>The next six months</h2>
          <ol>
            <li>25 restaurants in Halifax live, set up in person.</li>
            <li>Three offices ordering team lunch through Slack every week.</li>
            <li>Self-serve sign-up, then billing once a restaurant passes the free tier.</li>
            <li>Courier delivery through Uber Direct for restaurants without their own drivers.</li>
          </ol>
          <p>We'll measure four numbers: completed orders, quotes that turn into orders, orders lost to stale stock, and time to set up a restaurant.</p>

          <h2>What could go wrong</h2>
          <ul>
            <li>Delivery platforms could make agent ordering free for restaurants and keep them on their side.</li>
            <li>Owners may not keep stock current. Text updates are our answer; we don't know yet if it's enough.</li>
            <li>Agent platforms could restrict which outside tools their agents may use.</li>
            <li>There's one founder, working on this alongside school.</li>
          </ul>

          <h2>How you can help</h2>
          <ul>
            <li>Introductions to restaurant owners or office managers in Halifax.</li>
            <li>Grants, cloud credits or AI credits.</li>
            <li>A small cheque, if you'd like to back this early. Write to us and we'll send terms.</li>
            <li>Advice from people who've built point-of-sale, restaurant or marketplace software.</li>
          </ul>

          <h2>Team</h2>
          <p>
            {SITE.founder}, solo founder. Computer Science co-op student at Dalhousie University in Halifax. Builds in public on{" "}
            <a href={SITE.github}>GitHub</a>.
          </p>

          <h2>Contact</h2>
          <p>
            {SITE.contactEmail}. We reply to every message.
          </p>
        </article>
      </main>
      <Footer />
    </>
  );
}

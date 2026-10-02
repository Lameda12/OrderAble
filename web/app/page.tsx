import { CoverageMap } from "@/components/CoverageMap";
import { Footer } from "@/components/Footer";
import { LiveDemo } from "@/components/LiveDemo";
import { Nav } from "@/components/Nav";
import { Proof } from "@/components/Proof";
import { Reveal } from "@/components/Reveal";

const GITHUB = "https://github.com/Lameda12/OrderAble";

const EARLY_ACCESS = (plan: string) =>
  `${GITHUB}/issues/new?title=${encodeURIComponent(`Early access: ${plan}`)}&labels=early-access`;

const STEPS = [
  {
    n: "1",
    title: "Show your assistant the menu",
    body: "Paste it into Claude, or send a photo. It sets up Orderable for you and asks about what it can't see, like allergens. Later, text \"out of croissants\" and it's done.",
  },
  {
    n: "2",
    title: "Agents ask, you answer",
    body: "They check what's in stock right now and get a quote that holds for ten minutes. An allergen you haven't listed shows up as unknown, never as safe.",
  },
  {
    n: "3",
    title: "You get the order",
    body: "Paid at pickup, on invoice, or on your own checkout page. Nobody takes a cut. Test mode stays on until you switch it off.",
  },
];

const REGIONS: [string, string, string][] = [
  ["North America", "Now", "Pickup and your own delivery. Uber Direct and DoorDash Drive next."],
  ["Europe", "Soon", "Wolt Drive."],
  ["Southeast Asia", "Later", "GrabExpress."],
];

const PLANS = [
  {
    name: "Open source",
    price: "$0",
    unit: "MIT license, self-hosted",
    points: ["Everything in this repo", "Run it on any machine"],
    cta: "Get the code",
    href: GITHUB,
  },
  {
    name: "Hosted",
    price: "$0",
    unit: "up to 50 orders a month",
    points: ["We run the server", "Telegram and Slack set up for you", "One location"],
    cta: "Request access",
    href: EARLY_ACCESS("Hosted"),
    featured: true,
  },
  {
    name: "Pro",
    price: "$0.25",
    unit: "per completed order",
    points: ["Unlimited locations", "Cancelled orders are free"],
    cta: "Request access",
    href: EARLY_ACCESS("Pro"),
  },
];

export default function Page() {
  return (
    <main id="content">
      <Nav />

      <section className="section hero" id="top">
        <Reveal>
          <h1 className="headline">Still scrolling for lunch at 11:58?</h1>
        </Reveal>
        <Reveal delay={1}>
          <p className="lede">
            Orderable lets an AI agent order from local restaurants for you. Say what you want in Slack, Telegram or Claude, check the total, and
            say yes.
          </p>
        </Reveal>
        <Reveal delay={2}>
          <div className="ctas">
            <a className="pill crust" href="#demo">
              Watch it order lunch
            </a>
            <a className="textlink" href="/docs">
              Read the docs ›
            </a>
          </div>
        </Reveal>
      </section>

      <section className="section tight" id="demo">
        <Reveal>
          <p className="eyebrow">Someone types this in Slack:</p>
        </Reveal>
        <Reveal delay={1}>
          <LiveDemo />
        </Reveal>
      </section>

      <section className="section owners" id="restaurants">
        <Reveal>
          <h2 className="headline md">For restaurants, cafes and bakeries</h2>
        </Reveal>
        <Reveal delay={1}>
          <p className="lede">
            The delivery apps can already talk to AI agents. The bakery down the street can't. Orderable is the open-source piece that fixes that.
          </p>
        </Reveal>
        <div className="steps3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={(i % 3) as 0 | 1 | 2} className="step3">
              <span className="step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="fineprint">
            Works with Claude, any MCP client, Telegram and Slack. WhatsApp and iMessage are on the way. <a className="textlink" href="/docs/owners">Owner guide ›</a>
          </p>
        </Reveal>
      </section>

      <section className="section" id="coverage">
        <Reveal>
          <h2 className="headline md">Starting in Halifax</h2>
        </Reveal>
        <Reveal delay={1}>
          <CoverageMap />
        </Reveal>
        <Reveal delay={2}>
          <div className="regions">
            {REGIONS.map(([region, status, couriers]) => (
              <div key={region}>
                <p className="region-name">
                  {region} <span className="region-status">{status}</span>
                </p>
                <p className="region-couriers">{couriers}</p>
              </div>
            ))}
          </div>
          <p className="fineprint small">
            Courier integrations are in development. Names belong to their owners; we're not affiliated.{" "}
            <a className="textlink" href={EARLY_ACCESS("My city")}>
              Ask for your city ›
            </a>
          </p>
        </Reveal>
      </section>

      <Proof />

      <section className="section" id="plans">
        <Reveal>
          <h2 className="headline md">Pricing</h2>
        </Reveal>
        <div className="plans">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={(i % 3) as 0 | 1 | 2} className={`plan ${plan.featured ? "featured" : ""}`}>
              <p className="plan-name">{plan.name}</p>
              <p className="plan-price">{plan.price}</p>
              <p className="plan-unit">{plan.unit}</p>
              <ul>
                {plan.points.map((pt) => (
                  <li key={pt}>{pt}</li>
                ))}
              </ul>
              <a className={`pill ${plan.featured ? "crust" : "ghost"}`} href={plan.href}>
                {plan.cta}
              </a>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="fineprint">Hosted plans are in early access. Customers pay the restaurant directly, and we never see card numbers.</p>
        </Reveal>
      </section>

      <section className="section closing">
        <Reveal>
          <h2 className="headline md">Try it on your own machine</h2>
        </Reveal>
        <Reveal delay={1}>
          <code className="install">
            <b>$</b>git clone {GITHUB.replace("https://", "")} &amp;&amp; cd OrderAble &amp;&amp; npm i
          </code>
          <div className="ctas">
            <a className="pill primary" href="/docs">
              Quickstart
            </a>
            <a className="textlink" href={GITHUB}>
              GitHub ›
            </a>
          </div>
        </Reveal>
      </section>

      <Footer />
    </main>
  );
}

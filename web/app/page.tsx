import { Console } from "@/components/Console";
import { LiveDemo } from "@/components/LiveDemo";
import { Reveal } from "@/components/Reveal";

const GITHUB = "https://github.com/Lameda12/OrderAble";

const tools = [
  ["list_locations", "Where you are, when you're open, whether you deliver to them."],
  ["search_menu", "What's on, what's fresh, what fits their diet. Live availability on every item."],
  ["get_item", "Every modifier, every allergen. Unknown means unknown."],
  ["check_availability", "Can it be ready by then? Honors lead times, hours and sell-outs."],
  ["plan_group_order", "Feeds a whole team inside an all-in budget. Every diet covered, or it says so."],
  ["quote_order", "Prices the cart and locks it for ten minutes. No quote, no order."],
  ["place_order", "Idempotent. Retry all you want, it only happens once."],
  ["get_order_status", "Received, accepted, preparing, ready. Timestamped."],
  ["cancel_order", "Inside the window you set. Not a minute after."],
];

export default function Page() {
  return (
    <main>
      <nav className="nav">
        <a href="#top" className="wordmark">
          <i aria-hidden />
          Orderable
        </a>
        <div className="nav-links">
          <a href="#demo" className="nav-keep">Demo</a>
          <a href="#trust">Trust</a>
          <a href="#tools">Tools</a>
          <a href="#owners">Owners</a>
          <a href="#channels">Chat apps</a>
          <a href="#try">Try it</a>
          <a href={GITHUB} className="nav-keep">GitHub</a>
        </div>
      </nav>

      {/* Hero */}
      <section className="section hero" id="top">
        <div className="glow" aria-hidden />
        <Reveal>
          <p className="eyebrow crust">Introducing Orderable</p>
        </Reveal>
        <Reveal delay={1}>
          <h1 className="headline">
            Your menu.
            <br />
            <span className="crust">Orderable by AI.</span>
          </h1>
        </Reveal>
        <Reveal delay={2}>
          <p className="lede">
            An open-source MCP server that lets any AI agent find your food, check what’s fresh, and place a real order.{" "}
            <strong className="nowrap">No app.</strong> <strong className="nowrap">No aggregator.</strong>
          </p>
        </Reveal>
        <Reveal delay={3}>
          <div className="ctas">
            <a className="pill primary" href="#demo">
              Watch it order lunch
            </a>
            <a className="textlink" href={GITHUB}>
              View on GitHub ›
            </a>
          </div>
        </Reveal>
        <Reveal delay={3}>
          <div className="hero-chips">
            <span>restaurants</span>
            <span>cafes</span>
            <span>bakeries</span>
            <span>local delivery</span>
          </div>
        </Reveal>
      </section>

      {/* Statement */}
      <section className="section statement">
        <Reveal>
          <h2 className="headline md">
            Your next customer <span className="dim">isn’t a person.</span>
          </h2>
        </Reveal>
        <Reveal delay={1}>
          <p className="lede">
            It’s an agent, ordering for one. The big aggregators already speak its language.{" "}
            <strong>The bakery on the corner doesn’t.</strong> Until now.
          </p>
        </Reveal>
      </section>

      {/* Demo */}
      <section className="section" id="demo">
        <Reveal>
          <p className="eyebrow">Live demo</p>
        </Reveal>
        <Reveal delay={1}>
          <h2 className="headline md">
            Lunch for twelve.
            <br />
            <span className="crust">One sentence.</span>
          </h2>
        </Reveal>
        <Reveal delay={2}>
          <LiveDemo />
        </Reveal>
      </section>

      {/* Stats */}
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="stats">
          {[
            ["9", "tools. The whole API."],
            ["10", "minute price lock on every quote."],
            ["0", "card numbers through the agent."],
            ["1×", "Every order happens once. Retries included."],
          ].map(([n, l], i) => (
            <Reveal key={n} delay={(i % 4) as 0 | 1 | 2 | 3} className="stat">
              <div className={`num ${i === 0 ? "crust-text" : ""}`}>{n}</div>
              <div className="label">{l}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="section" id="trust">
        <Reveal>
          <h2 className="headline md">
            Agents don’t read banners.
            <br />
            <span className="dim">They check facts.</span>
          </h2>
        </Reveal>
        <Reveal delay={1}>
          <p className="lede">Is availability accurate. Does checkout work. Does it fit the budget. Orderable answers all three, in data a machine can verify.</p>
        </Reveal>
        <div className="pillars">
          <Reveal className="tile">
            <h3>Timestamped.</h3>
            <p>
              Every price and every stock count carries <code>as_of</code> and <code>ttl_seconds</code>.{" "}
              <strong>Stale data is the number one reason an agent drops a merchant.</strong> Yours never goes stale silently.
            </p>
            <div className="specimen">
              <div><span className="k">status</span> <span className="meh">"low"</span></div>
              <div><span className="k">quantity</span> 3</div>
              <div><span className="k">as_of</span> "2026-10-07T13:00:00Z"</div>
              <div><span className="k">ttl_seconds</span> 300</div>
            </div>
          </Reveal>
          <Reveal className="tile" delay={1}>
            <h3>Honest allergens.</h3>
            <p>
              Contains. May contain. Unknown. <strong>Missing data is never “safe”.</strong> A gluten-free bowl from a bakery that handles wheat
              gets flagged, not hidden.
            </p>
            <div className="specimen">
              <div><span className="k">milk</span> <span className="bad">contains</span></div>
              <div><span className="k">gluten</span> <span className="meh">may_contain</span></div>
              <div><span className="k">sesame</span> <span className="meh">unknown</span></div>
              <div><span className="k">default</span> <span className="meh">unknown</span>, never <span className="good">safe</span></div>
            </div>
          </Reveal>
          <Reveal className="tile" delay={2}>
            <h3>Safe by default.</h3>
            <p>
              No quote, no order. Spending caps per order and per day. <strong>DRY_RUN is on</strong> until the owner flips it. Payment happens at the
              counter, on invoice, or on your own page.
            </p>
            <div className="specimen">
              <div><span className="k">code</span> <span className="bad">"POLICY_BLOCKED"</span></div>
              <div><span className="k">violation</span> "ORDER_TOTAL_CAP"</div>
              <div><span className="k">limit</span> 50000 <span className="k">actual</span> 61230</div>
              <div><span className="k">suggested_next_tool</span> null</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Tools */}
      <section className="section" id="tools" style={{ paddingTop: 40 }}>
        <Reveal>
          <h2 className="headline md">
            Nine tools.
            <br />
            <span className="dim">That’s the whole thing.</span>
          </h2>
        </Reveal>
        <div className="tools">
          {tools.map(([name, desc], i) => (
            <Reveal key={name} className="tool-row">
              <code>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                {name}
              </code>
              <p>{desc}</p>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="lede" style={{ fontSize: 19 }}>
            Plus <code className="mono">orderable://menu/{"{location}"}</code> and <code className="mono">orderable://policies</code>, readable without a single
            tool call.
          </p>
        </Reveal>
      </section>

      {/* Owners */}
      <section className="section owners" id="owners">
        <Reveal>
          <p className="eyebrow crust">For owners</p>
        </Reveal>
        <Reveal delay={1}>
          <h2 className="headline md">
            Built for the person
            <br />
            who bakes the bread.
          </h2>
        </Reveal>
        <Reveal delay={2}>
          <p className="lede">
            No developer required. Answer five questions, edit one file, and get a score that tells you exactly what agents will trip over.
          </p>
        </Reveal>
        <div className="owner-grid">
          <Reveal>
            <div className="ring-wrap">
              <div className="ring" />
              <div className="ring-label">
                <div className="num">94</div>
                <div className="of">agent readiness / 100</div>
              </div>
            </div>
          </Reveal>
          <Reveal delay={1}>
            <div className="terminal">
              <span className="p">$</span> orderable doctor{"\n\n"}
              {"  "}Agent readiness  <span className="b">94/100</span>{"\n\n"}
              {"  "}<span className="y">~</span> Allergen coverage        21/25  <span className="d">31/37 items</span>{"\n"}
              {"  "}<span className="g">✓</span> Stock tracked            15/15{"\n"}
              {"  "}<span className="g">✓</span> Availability freshness   10/10{"\n"}
              {"  "}<span className="g">✓</span> Opening hours            15/15{"\n"}
              {"  "}<span className="g">✓</span> Delivery zones           10/10{"\n"}
              {"  "}<span className="g">✓</span> Quote-to-order flow      20/20{"\n"}
              {"  "}<span className="y">~</span> Item descriptions         3/5{"\n\n"}
              {"  "}<span className="b">Top fixes</span>{"\n"}
              {"  "}1. Add allergens to Seasonal Fruit Galette… <span className="g">(+4)</span>
            </div>
          </Reveal>
        </div>
        <div className="steps">
          {[
            ["orderable init", "Pick bakery, cafe, restaurant or delivery. Get a starter menu that already makes sense."],
            ["orderable validate", "“Croissant has no allergen info, agents will treat it as unknown.” Line 54."],
            ["orderable doctor", "A score out of 100 and the three fixes worth the most."],
            ["orderable serve", "Claude Desktop, Claude Code, or any MCP client. stdio or HTTP."],
          ].map(([cmd, desc], i) => (
            <Reveal key={cmd} className="step" delay={(i % 4) as 0 | 1 | 2 | 3}>
              <code>{cmd}</code>
              <p>{desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Channels */}
      <section className="section" id="channels">
        <Reveal>
          <p className="eyebrow crust">Everywhere your team talks</p>
        </Reveal>
        <Reveal delay={1}>
          <h2 className="headline md">
            Order from the chat
            <br />
            <span className="dim">you already have open.</span>
          </h2>
        </Reveal>
        <Reveal delay={2}>
          <p className="lede">
            Same nine tools, same rules, same safety checks. <strong>Telegram, Slack, or any MCP client.</strong>
          </p>
        </Reveal>
        <div className="pillars">
          <Reveal className="tile">
            <h3>Telegram.</h3>
            <p>
              A bot from <code>@BotFather</code> and one command. <strong>No server needed:</strong> <code>orderable bot telegram</code> long-polls
              from the laptop behind the counter.
            </p>
            <div className="specimen">
              <div><span className="k">you</span> 3 oat lattes, 2pm pickup</div>
              <div><span className="k">bot</span> $20.52 incl. tax. Place it?</div>
              <div><span className="k">you</span> <span className="good">yes</span></div>
            </div>
          </Reveal>
          <Reveal className="tile" delay={1}>
            <h3>Slack.</h3>
            <p>
              @mention it in <code>#lunch</code> and it answers in the thread. DM it, or type <code>/order</code>. <strong>One manifest</strong>, paste and
              install.
            </p>
            <div className="specimen">
              <div><span className="k">#lunch</span> lunch for 12, 3 veg, 1 GF</div>
              <div><span className="k">budget</span> $20 a head</div>
              <div><span className="k">thread</span> <span className="good">everyone covered</span></div>
              <div><span className="k">total</span> $227.76</div>
            </div>
          </Reveal>
          <Reveal className="tile" delay={2}>
            <h3>Any MCP client.</h3>
            <p>
              Claude Desktop, Claude Code, Claude in Slack, Cursor. <strong>Paste one URL</strong> and the agent sees your whole menu.
            </p>
            <div className="specimen">
              <div><span className="k">url</span> /api/mcp/&lt;token&gt;</div>
              <div><span className="k">tools</span> 9</div>
              <div><span className="k">resources</span> menu, policies</div>
              <div><span className="k">dry_run</span> <span className="meh">true</span></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Try it */}
      <section className="section" id="try">
        <Reveal>
          <p className="eyebrow">Try it yourself</p>
        </Reveal>
        <Reveal delay={1}>
          <h2 className="headline md">
            It’s a real endpoint.
            <br />
            <span className="crust">Point your agent at it.</span>
          </h2>
        </Reveal>
        <Reveal delay={2}>
          <p className="lede" style={{ fontSize: 21 }}>
            Two fake Halifax businesses, live stock, DRY_RUN on. Call a tool here, or add it to Claude in one line.
          </p>
        </Reveal>
        <Reveal delay={2}>
          <Console />
        </Reveal>
      </section>

      {/* One more thing */}
      <section className="section omt">
        <Reveal>
          <p className="small">One more thing.</p>
        </Reveal>
        <Reveal delay={1}>
          <h2 className="headline">
            It’s <span className="crust">free.</span>
          </h2>
        </Reveal>
        <Reveal delay={2}>
          <p className="lede">
            MIT licensed. Runs on the laptop behind the counter. Every POS is just another adapter: <strong>Square, Toast, Clover, Shopify</strong> are next.
          </p>
        </Reveal>
        <Reveal delay={3}>
          <div>
            <code className="install">
              <b>$</b>git clone {GITHUB.replace("https://", "")} &amp;&amp; cd OrderAble &amp;&amp; npm i
            </code>
          </div>
          <div className="ctas">
            <a className="pill crust" href={GITHUB}>
              Get Orderable
            </a>
            <a className="textlink" href={`${GITHUB}/blob/main/examples/team-lunch.md`}>
              Read the transcript ›
            </a>
          </div>
        </Reveal>
      </section>

      <footer>
        <span>Orderable · open source · MIT · Designed in Halifax, Nova Scotia.</span>
        <span>
          Crumb &amp; Co and Northline Coffee are fictional. <a href={GITHUB}>Source</a>
        </span>
      </footer>
    </main>
  );
}

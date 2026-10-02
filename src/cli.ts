#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { type ConfigFile, loadConfig } from "./config.js";
import { runDoctor } from "./doctor.js";
import { OrderableError } from "./errors.js";
import { lintMenu } from "./lint.js";
import { BusinessType } from "./schema.js";
import { createServer as createNodeServer } from "node:http";
import { OrderableAgent } from "./agent.js";
import { handleSlackRequest, slackManifest } from "./channels/slack.js";
import { STOCK_HELP, applyStockMessage, ownerIds } from "./stock-text.js";
import { TelegramApi, runTelegramPolling } from "./channels/telegram.js";
import { VERSION, createAdapter, createService, runHttp, runStdio } from "./server.js";
import { type InitAnswers, configTemplate, menuTemplate } from "./templates.js";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = { bold: paint("1"), dim: paint("2"), red: paint("31"), green: paint("32"), yellow: paint("33"), cyan: paint("36") };

const HELP = `orderable ${VERSION}: make your food business orderable by AI agents

Usage
  orderable init                 Create menu.yaml and orderable.config.yaml (interactive)
  orderable validate [file]      Check menu.yaml and explain problems in plain English
  orderable doctor               Agent-readiness score out of 100, with the top 3 fixes
  orderable serve --stdio        Run the MCP server for Claude Desktop / Claude Code
  orderable serve --http         Run the MCP server over Streamable HTTP (needs ORDERABLE_TOKEN)
  orderable serve --stdio --owner   Same, plus owner tools: set up the menu by talking to your AI assistant
  orderable stock "<message>"    Update stock in plain words, e.g. "out of croissants"
  orderable bot telegram         Telegram bot (long polling, no public URL needed)
  orderable bot slack            Slack app endpoint: /slack/events and /slack/commands
  orderable bot slack-manifest <public-url>   Print a Slack app manifest

Options
  --config <path>    Config file (default ./orderable.config.yaml)
  --adapter <name>   file | mock | square (overrides config)
  --menu <path>      Menu file (default ./menu.yaml)
  --db <path>        SQLite file (default ./orderable.db)
  --port <n>         HTTP port (default 3333)
  --host <addr>      HTTP host (default 127.0.0.1)
  --type <type>      init: restaurant | cafe | bakery | delivery
  --name <name>      init: business name
  --yes              init: accept defaults, no questions
  --force            init: overwrite existing files
  --json             validate/doctor: machine-readable output
  -h, --help         Show this help
  -v, --version      Show version

Environment
  DRY_RUN=false      Actually send orders to the merchant (default: true, record only)
  ORDERABLE_TOKEN    Bearer token required by --http (or use the URL /mcp/<token>)
  ORDERABLE_OWNER_TOKEN   Second token for --http that also unlocks the owner tools
  ANTHROPIC_API_KEY  For the chat bots (Claude runs the conversation)
  TELEGRAM_BOT_TOKEN From @BotFather
  SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET   From your Slack app
  ORDERABLE_OWNER_TELEGRAM_IDS, ORDERABLE_OWNER_SLACK_IDS   Who may update stock by message
`;

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: "string" },
    adapter: { type: "string" },
    menu: { type: "string" },
    db: { type: "string" },
    port: { type: "string" },
    host: { type: "string" },
    type: { type: "string" },
    name: { type: "string" },
    yes: { type: "boolean", short: "y" },
    force: { type: "boolean" },
    json: { type: "boolean" },
    stdio: { type: "boolean" },
    http: { type: "boolean" },
    owner: { type: "boolean" },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
  },
});

function config() {
  const overrides: Partial<ConfigFile> = {};
  if (flags.adapter) overrides.adapter = flags.adapter as ConfigFile["adapter"];
  if (flags.menu) overrides.menu = flags.menu;
  if (flags.db) overrides.database = flags.db;
  const cfg = loadConfig(flags.config ?? "orderable.config.yaml", overrides);
  if (flags.port) cfg.http.port = Number(flags.port);
  if (flags.host) cfg.http.host = flags.host;
  return cfg;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-") || "my-business";

async function init() {
  const menuPath = resolve(flags.menu ?? "menu.yaml");
  const configPath = resolve(flags.config ?? "orderable.config.yaml");
  if (!flags.force && existsSync(menuPath)) {
    console.error(`${c.yellow("!")} ${menuPath} already exists. Use --force to overwrite.`);
    process.exit(1);
  }

  const interactive = !flags.yes && process.stdin.isTTY;
  const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = async (q: string, def: string) => {
    if (!rl) return def;
    const a = (await rl.question(`${c.cyan("?")} ${q} ${c.dim(`(${def})`)} `)).trim();
    return a || def;
  };

  if (interactive) console.log(`\n${c.bold("Let's make your business orderable by AI agents.")}\n`);
  let type = flags.type ?? (await ask("What kind of business? restaurant / cafe / bakery / delivery", "bakery"));
  while (!BusinessType.safeParse(type).success) {
    if (!rl) {
      console.error(`${c.red("✗")} --type must be one of: restaurant, cafe, bakery, delivery`);
      process.exit(1);
    }
    type = await ask("Please type one of: restaurant, cafe, bakery, delivery", "bakery");
  }
  const name = flags.name ?? (await ask("Business name?", "My Bakery"));
  const answers: InitAnswers = {
    type: type as InitAnswers["type"],
    name,
    id: slug(name),
    line1: await ask("Street address?", "1 Main St"),
    city: await ask("City?", "Halifax"),
    region: await ask("Province/state code?", "NS"),
    postal_code: await ask("Postal code?", "B3J 1A1"),
    timezone: await ask("Timezone?", "America/Halifax"),
    tax_rate: Number(await ask("Sales tax %?", "14")) || 0,
  };
  rl?.close();

  writeFileSync(menuPath, menuTemplate(answers));
  if (flags.force || !existsSync(configPath)) writeFileSync(configPath, configTemplate("file"));

  console.log(`
${c.green("✓")} Wrote ${c.bold("menu.yaml")} with example ${answers.type} items. Replace them with yours.
${c.green("✓")} Wrote ${c.bold("orderable.config.yaml")} (dry_run is ON: nothing reaches your kitchen yet).

Next:
  1. Edit menu.yaml
  2. ${c.cyan("orderable validate")}   catch mistakes
  3. ${c.cyan("orderable doctor")}     see how agent-ready you are
  4. ${c.cyan("orderable serve --stdio")}  connect Claude
`);
}

function validate() {
  const path = resolve(positionals[1] ?? flags.menu ?? "menu.yaml");
  if (!existsSync(path)) {
    console.error(`${c.red("✗")} No menu at ${path}. Run ${c.cyan("orderable init")} first.`);
    process.exit(1);
  }
  const { findings, file } = lintMenu(readFileSync(path, "utf8"));
  const errors = findings.filter((f) => f.severity === "error");
  if (flags.json) {
    console.log(JSON.stringify({ ok: errors.length === 0, findings }, null, 2));
    process.exit(errors.length ? 1 : 0);
  }
  const rel = positionals[1] ?? flags.menu ?? "menu.yaml";
  for (const f of findings) {
    const where = c.dim(`${rel}:${f.line ?? "?"}`);
    console.log(`${f.severity === "error" ? c.red("✗ error  ") : c.yellow("! warning")} ${where}  ${f.message}`);
  }
  if (errors.length) {
    console.log(`\n${c.red(`${errors.length} error(s)`)} must be fixed before agents can order.`);
    process.exit(1);
  }
  const items = file?.items.length ?? 0;
  const locs = file?.locations.length ?? 0;
  console.log(
    `\n${c.green("✓")} menu.yaml is valid: ${items} item(s), ${locs} location(s)` +
      (findings.length ? `, ${findings.length} warning(s) worth fixing.` : ". No warnings."),
  );
}

async function doctor() {
  const cfg = config();
  const report = await runDoctor(createAdapter(cfg), cfg);
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const color = report.score >= 85 ? c.green : report.score >= 60 ? c.yellow : c.red;
  console.log(`\n  Agent readiness  ${color(c.bold(`${report.score}/100`))}\n`);
  for (const ch of report.checks) {
    const mark = ch.points === ch.max ? c.green("✓") : ch.points === 0 ? c.red("✗") : c.yellow("~");
    console.log(`  ${mark} ${ch.label.padEnd(24)} ${String(ch.points).padStart(2)}/${String(ch.max).padEnd(3)} ${c.dim(ch.detail)}`);
  }
  if (report.top_fixes.length) {
    console.log(`\n  ${c.bold("Top fixes")}`);
    report.top_fixes.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  } else console.log(`\n  ${c.green("Nothing to fix. Agents will love you.")}`);
  console.log("");
}

async function serve() {
  const cfg = config();
  const service = createService(cfg);
  if (flags.http) {
    let token = process.env.ORDERABLE_TOKEN ?? "";
    if (!token) {
      token = randomBytes(24).toString("base64url");
      console.error(`${c.yellow("!")} ORDERABLE_TOKEN not set. Generated one for this run:\n  ${token}\n`);
    }
    const ownerToken = process.env.ORDERABLE_OWNER_TOKEN || undefined;
    if (ownerToken && ownerToken === token) throw new Error("ORDERABLE_OWNER_TOKEN must differ from ORDERABLE_TOKEN");
    await runHttp(service, { port: cfg.http.port, host: cfg.http.host, token, ownerToken });
  } else {
    await runStdio(service, { owner: !!flags.owner });
  }
}

async function bot() {
  const kind = positionals[1];
  if (kind === "slack-manifest") {
    const base = (positionals[2] ?? "https://your-host.example.com").replace(/\/$/, "");
    console.log(JSON.stringify(slackManifest(base), null, 2));
    return;
  }
  const cfg = config();
  const agent = new OrderableAgent({ service: createService(cfg) });
  if (kind === "telegram") {
    const ac = new AbortController();
    process.on("SIGINT", () => ac.abort());
    await runTelegramPolling(agent, new TelegramApi(process.env.TELEGRAM_BOT_TOKEN ?? ""), ac.signal, {
      owners: ownerIds(process.env.ORDERABLE_OWNER_TELEGRAM_IDS),
    });
    return;
  }
  if (kind === "slack") {
    const botToken = process.env.SLACK_BOT_TOKEN ?? "";
    const signingSecret = process.env.SLACK_SIGNING_SECRET ?? "";
    if (!botToken || !signingSecret) throw new Error("Set SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET");
    const port = Number(flags.port ?? 3334);
    const host = flags.host ?? "0.0.0.0";
    createNodeServer(async (req, res) => {
      const path = new URL(req.url ?? "/", "http://x").pathname;
      if (req.method !== "POST" || !["/slack/events", "/slack/commands"].includes(path)) {
        res.statusCode = 404;
        return res.end("Slack endpoints: POST /slack/events, POST /slack/commands");
      }
      const chunks: Buffer[] = [];
      for await (const ch of req) chunks.push(ch as Buffer);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      const result = handleSlackRequest(Buffer.concat(chunks).toString("utf8"), headers, {
        agent,
        botToken,
        signingSecret,
        owners: ownerIds(process.env.ORDERABLE_OWNER_SLACK_IDS),
      });
      res.statusCode = result.status;
      res.setHeader("content-type", result.contentType);
      res.end(result.body);
      result.background?.().catch((e) => console.error("slack background job failed", e));
    }).listen(port, host, () =>
      console.error(`Slack endpoints on http://${host}:${port}/slack/events and /slack/commands (adapter=${cfg.adapter}, dry_run=${cfg.dry_run})`),
    );
    return;
  }
  console.error("Usage: orderable bot telegram | slack | slack-manifest <public-url>");
  process.exit(2);
}

async function stock() {
  const text = positionals.slice(1).join(" ").trim();
  if (!text) return console.log(STOCK_HELP);
  const cfg = config();
  const result = await applyStockMessage(createAdapter(cfg), text);
  if (!result.handled) {
    console.error(`${c.yellow("!")} Not a stock update. ${STOCK_HELP}`);
    process.exit(2);
  }
  console.log(`${result.changes.length ? c.green("✓") : c.yellow("!")} ${result.message}`);
  if (!result.changes.length) process.exit(1);
}

async function main() {
  if (flags.version) return console.log(VERSION);
  const cmd = positionals[0];
  if (flags.help || !cmd) return console.log(HELP);
  switch (cmd) {
    case "init":
      return init();
    case "validate":
      return validate();
    case "doctor":
      return doctor();
    case "serve":
      return serve();
    case "bot":
      return bot();
    case "stock":
      return stock();
    default:
      console.error(`Unknown command "${cmd}".\n\n${HELP}`);
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(`${c.red("✗")} ${e instanceof OrderableError ? e.message : e instanceof Error ? e.stack : String(e)}`);
  process.exit(1);
});

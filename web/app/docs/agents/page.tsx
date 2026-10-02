import type { Metadata } from "next";
import { DocNext } from "@/components/DocNext";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Agents · Orderable Docs" };

const DEMO_URL = `${SITE.url}/api/mcp/orderable-demo`;

export default function Agents() {
  return (
    <>
      <h1>Agents</h1>
      <p className="lead">
        Orderable is a standard MCP server, so any agent that can use MCP tools can order through it. Here's how the common ones connect, and what
        we have and haven't tested ourselves.
      </p>
      <p>
        Every agent needs one of two things: a command to start Orderable locally (stdio), or a URL for the hosted endpoint (Streamable HTTP). If a
        client can't send an <code>Authorization</code> header, put the token in the URL: <code>https://your-host/mcp/&lt;token&gt;</code>. To try
        it now, use the public demo: <code>{DEMO_URL}</code>.
      </p>

      <h2>Tested by us</h2>
      <ul>
        <li>MCP Inspector, over stdio and HTTP</li>
        <li>The official MCP TypeScript SDK client</li>
        <li>Claude, through Orderable's own Telegram and Slack bots</li>
      </ul>

      <h2>Claude (Desktop, Code, claude.ai)</h2>
      <p>
        See <a href="/docs/connect">Connect a client</a>. In claude.ai, add a custom connector with the URL form.
      </p>

      <h2>Grok (xAI API)</h2>
      <p>
        xAI's API can call remote MCP servers as a tool, over Streamable HTTP or SSE. Point it at the URL form of your endpoint and follow xAI's{" "}
        <a href="https://docs.x.ai/developers/tools/remote-mcp">Remote MCP Tools guide</a> for the request shape. Not tested by us yet.
      </p>

      <h2>Hermes Agent (Nous Research)</h2>
      <p>Hermes connects to MCP servers over stdio or HTTP. From its CLI:</p>
      <pre>
        <code>hermes mcp add --url https://your-host/mcp/&lt;token&gt; orderable</code>
      </pre>
      <p>
        Or add a stdio server in <code>~/.hermes/config.yaml</code> that runs <code>node /path/to/OrderAble/dist/cli.js serve --stdio</code>. See
        Hermes's <a href="https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp">MCP guide</a>. Not tested by us yet.
      </p>

      <h2>OpenClaw (formerly Clawdbot)</h2>
      <p>
        OpenClaw is an MCP client that you talk to through Telegram, Slack, WhatsApp, iMessage and other chat apps, so it's one possible route to Orderable from WhatsApp and iMessage before we support them directly.
        Add Orderable to <code>~/.openclaw/openclaw.json</code>:
      </p>
      <pre>
        <code>{`{
  "mcpServers": {
    "orderable": {
      "transport": "http",
      "url": "https://your-host/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}`}</code>
      </pre>
      <p>
        Then run <code>openclaw gateway restart</code>. Not tested by us yet.
      </p>

      <h2>Meta Muse</h2>
      <p>
        Muse Code, Meta's coding agent, supports MCP servers. As of late September 2026, the Muse consumer app doesn't document a way to add your own
        MCP server.
      </p>

      <h2>OpenAI Dots</h2>
      <p>
        Dots launched on September 29, 2026 and works with apps through OpenAI's connectors. OpenAI hasn't documented adding a custom MCP server to
        Dots yet. We'll add steps here when it does.
      </p>

      <h2>Jev (TypeSafe)</h2>
      <p>
        Jev isn't an agent. It's a fast decision model that agents use to pick the next step, such as which tool to call. If your agent uses Jev for
        routing, Orderable's tools are just more options for it to choose from.
      </p>

      <h2>Anything else</h2>
      <p>
        If an agent supports MCP over stdio or Streamable HTTP, it should work. Let us know on{" "}
        <a href={`${SITE.github}/issues/new`}>GitHub</a> what worked and what didn't, and we'll add it here.
      </p>
      <DocNext from="/docs/agents" />
    </>
  );
}

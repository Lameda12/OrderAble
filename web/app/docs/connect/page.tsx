import type { Metadata } from "next";
import { DocNext } from "@/components/DocNext";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Connect a client · Orderable Docs" };

export default function Connect() {
  return (
    <>
      <h1>Connect a client</h1>
      <p className="lead">Orderable speaks MCP over stdio for local clients and Streamable HTTP for hosted ones.</p>

      <h2>Claude Desktop</h2>
      <p>
        Edit <code>claude_desktop_config.json</code> (macOS: <code>~/Library/Application Support/Claude/</code>, Windows: <code>%APPDATA%\Claude\</code>):
      </p>
      <pre>
        <code>{`{
  "mcpServers": {
    "orderable": {
      "command": "node",
      "args": ["/absolute/path/to/OrderAble/dist/cli.js", "serve", "--stdio"],
      "env": {
        "ORDERABLE_ADAPTER": "file",
        "ORDERABLE_MENU": "/absolute/path/to/menu.yaml",
        "ORDERABLE_DB": "/absolute/path/to/orderable.db"
      }
    }
  }
}`}</code>
      </pre>

      <h2>Claude Code</h2>
      <pre>
        <code>claude mcp add orderable -e ORDERABLE_ADAPTER=mock -- node /absolute/path/to/OrderAble/dist/cli.js serve --stdio</code>
      </pre>

      <h2>Over HTTP</h2>
      <pre>
        <code>{`ORDERABLE_TOKEN=change-me node dist/cli.js serve --http --port 3333
claude mcp add --transport http orderable http://127.0.0.1:3333/mcp \\
  --header "Authorization: Bearer change-me"`}</code>
      </pre>
      <p>
        HTTP always needs a token. Without <code>ORDERABLE_TOKEN</code> one is generated and printed. <code>GET /health</code> reports version, adapter
        and dry-run state.
      </p>

      <h2>URL-only clients</h2>
      <p>
        Some clients, like connector settings screens, take only a URL. Put the token in the path: <code>https://your-host/mcp/&lt;token&gt;</code>.
        Treat that URL like a password.
      </p>

      <h2>Try the public demo</h2>
      <pre>
        <code>{`claude mcp add --transport http orderable-demo ${SITE.url}/api/mcp \\
  --header "Authorization: Bearer orderable-demo"`}</code>
      </pre>
      <p>
        Or the URL form: <code>{SITE.url}/api/mcp/orderable-demo</code>. Fictional businesses, DRY_RUN on.
      </p>

      <h2>Environment</h2>
      <table>
        <tbody>
          <tr>
            <td><code>ORDERABLE_ADAPTER</code></td>
            <td><code>file</code> (default), <code>mock</code>, or <code>square</code> (experimental)</td>
          </tr>
          <tr>
            <td><code>ORDERABLE_MENU</code></td>
            <td>Path to menu.yaml</td>
          </tr>
          <tr>
            <td><code>ORDERABLE_DB</code></td>
            <td>SQLite file for quotes, orders and idempotency keys</td>
          </tr>
          <tr>
            <td><code>DRY_RUN</code></td>
            <td><code>false</code> to actually send orders to the merchant</td>
          </tr>
          <tr>
            <td><code>ORDERABLE_TOKEN</code></td>
            <td>Bearer token for HTTP</td>
          </tr>
        </tbody>
      </table>
      <DocNext from="/docs/connect" />
    </>
  );
}

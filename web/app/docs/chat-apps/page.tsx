import type { Metadata } from "next";
import { DocNext } from "@/components/DocNext";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Telegram & Slack · Orderable Docs" };

export default function ChatApps() {
  return (
    <>
      <h1>Telegram &amp; Slack</h1>
      <p className="lead">
        A Claude-powered assistant takes orders in chat using the same nine tools, so the same rules apply. It confirms the total before ordering and
        asks for contact details instead of inventing them.
      </p>
      <p>
        Every bot needs <code>ANTHROPIC_API_KEY</code>. Defaults: <code>claude-opus-5-5</code> at medium effort; change with{" "}
        <code>ORDERABLE_AGENT_MODEL</code> and <code>ORDERABLE_AGENT_EFFORT</code>. WhatsApp and iMessage are coming soon.
      </p>

      <h2>Telegram</h2>
      <ol>
        <li>Message @BotFather, send <code>/newbot</code>, copy the token.</li>
        <li>Run it. Polling needs no public URL:</li>
      </ol>
      <pre>
        <code>TELEGRAM_BOT_TOKEN=123:abc ANTHROPIC_API_KEY=sk-ant-... orderable bot telegram</code>
      </pre>
      <p>
        Or use a webhook: set <code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_WEBHOOK_SECRET</code> and <code>ANTHROPIC_API_KEY</code> on the server,
        then register once:
      </p>
      <pre>
        <code>{`curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \\
  -d url=${SITE.url}/api/telegram -d secret_token=$TELEGRAM_WEBHOOK_SECRET`}</code>
      </pre>
      <p>
        <code>/start</code> shows help; <code>/reset</code> starts a new conversation.
      </p>

      <h2>Slack</h2>
      <ol>
        <li>
          Get a manifest with your URLs: <code>orderable bot slack-manifest https://your-host</code>, or open <code>{SITE.url}/api/slack/manifest</code>.
        </li>
        <li>api.slack.com/apps → Create New App → From a manifest → paste → Install.</li>
        <li>Copy the Bot User OAuth Token and Signing Secret, then:</li>
      </ol>
      <pre>
        <code>{`SLACK_BOT_TOKEN=xoxb-... SLACK_SIGNING_SECRET=... ANTHROPIC_API_KEY=sk-ant-... \\
  orderable bot slack --port 3334`}</code>
      </pre>
      <p>
        @mention it in a channel and it answers in the thread, DM it, or use <code>/order lunch for 8 at noon</code>. Requests are signature-checked,
        acknowledged within Slack's 3 seconds, and de-duplicated.
      </p>

      <h2>Memory</h2>
      <p>Each chat (each thread in Slack channels) keeps its own conversation in memory. It starts fresh after 2 idle hours, when it gets long, or on restart.</p>
      <DocNext from="/docs/chat-apps" />
    </>
  );
}

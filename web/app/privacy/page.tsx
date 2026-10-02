import type { Metadata } from "next";
import { LegalPage } from "@/components/Prose";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy Policy · Orderable" };

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="Orderable collects as little as it can. The open-source software sends us nothing. This site has no analytics, no ads and no cookies. This page explains what the hosted demo and chat bots do with the little they receive."
    >
      <h2>Who is responsible</h2>
      <p>
        This site and the hosted Orderable services are run by {SITE.legalName}, {SITE.address}. The person responsible for personal
        information is {SITE.privacyOfficer}, reachable at {SITE.contactEmail}.
      </p>
      <p>
        If you run the open-source Orderable software yourself, or a food business runs it for you, that operator is responsible for the data it
        handles, not us. We never receive data from self-hosted installs.
      </p>

      <h2>What we collect, and why</h2>
      <table>
        <thead>
          <tr>
            <th>Where</th>
            <th>What</th>
            <th>Why</th>
            <th>Kept for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Visiting this website</td>
            <td>Standard request data such as IP address, browser user agent and the page requested, recorded by our host.</td>
            <td>Delivering the site, security and abuse prevention.</td>
            <td>Per our host's log retention (Vercel).</td>
          </tr>
          <tr>
            <td>Live demo and demo MCP endpoint</td>
            <td>The tool calls you send, such as menu searches, quotes and test orders, including any name, email, phone or address you type in.</td>
            <td>Running the demo you asked for.</td>
            <td>In memory only, lost when the server instance restarts. Demo orders are never sent to a real business (DRY_RUN).</td>
          </tr>
          <tr>
            <td>Telegram and Slack bots</td>
            <td>Your messages to the bot, your display name and handle or user ID, and any contact details you give for an order.</td>
            <td>Replying to you and placing the order you confirm.</td>
            <td>In memory for the conversation, reset after 2 idle hours or a server restart.</td>
          </tr>
          <tr>
            <td>Early access requests</td>
            <td>Whatever you write in the GitHub issue you open.</td>
            <td>Following up on your request.</td>
            <td>Until you or we delete the issue. GitHub issues are public.</td>
          </tr>
        </tbody>
      </table>
      <p>
        We do not sell personal information, share it for advertising, or use it to build profiles. We do not take payment card details: food orders
        are paid to the business directly, at pickup, on invoice, or on the business's own payment page.
      </p>

      <h2>Who processes it for us</h2>
      <ul>
        <li>
          <strong>Vercel</strong> hosts this site and its API routes.
        </li>
        <li>
          <strong>Anthropic</strong> runs the Claude model behind the Telegram and Slack bots. Your chat messages and the tool results needed to
          answer them are sent to Anthropic's API to generate replies, under Anthropic's commercial terms.
        </li>
        <li>
          <strong>Telegram</strong> and <strong>Slack</strong> carry messages between you and the bot, under their own privacy policies.
        </li>
        <li>
          <strong>GitHub</strong> hosts the code and early-access issues, under its own privacy policy.
        </li>
      </ul>
      <p>
        These providers may process data outside Canada, including in the United States, where it may be accessible to authorities under local law.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to access, correct or delete personal information we hold about you, or withdraw consent, by emailing {SITE.contactEmail}. We
        answer within 30 days. Because the demo and bots keep data only in memory, there is usually nothing left to delete; we will confirm either
        way. If you are not satisfied, you can complain to the{" "}
        <a href="https://www.priv.gc.ca/">Office of the Privacy Commissioner of Canada</a>, or to your local data protection authority if you are in
        the EU or UK.
      </p>

      <h2>Children</h2>
      <p>Orderable is built for businesses and adults ordering food. It is not intended for anyone under 18, and we do not knowingly collect children's data.</p>

      <h2>Security</h2>
      <p>
        Traffic is encrypted in transit. The hosted MCP endpoint requires a token, bot webhooks verify the platform's signature or secret, and the demo
        stores nothing on disk. No system is perfectly secure; tell us at {SITE.contactEmail} if you find a problem.
      </p>

      <h2>Changes</h2>
      <p>We will update the date above when this policy changes, and describe material changes on this page.</p>

      <h2>Contact</h2>
      <p>
        {SITE.legalName}, {SITE.address} · {SITE.contactEmail}
      </p>
    </LegalPage>
  );
}

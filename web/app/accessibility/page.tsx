import type { Metadata } from "next";
import { LegalPage } from "@/components/Prose";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Accessibility · Orderable" };

export default function Accessibility() {
  return (
    <LegalPage
      title="Accessibility"
      intro="We want everyone to be able to use Orderable, including the people ordering through it. We aim for WCAG 2.2 level AA."
    >
      <h2>What we do</h2>
      <ul>
        <li>Text colours are checked for AA contrast against their backgrounds.</li>
        <li>Everything works with a keyboard, with a visible focus ring and a "Skip to content" link.</li>
        <li>Animations respect your system's reduced-motion setting.</li>
        <li>The live demo announces results to screen readers as they arrive.</li>
        <li>Chat bots work in Telegram and Slack, which carry those apps' own accessibility features.</li>
      </ul>

      <h2>Known limitations</h2>
      <ul>
        <li>The JSON shown in the live demo and the endpoint console is long and best read in expanded form.</li>
        <li>Decorative gradient headlines are large text; their dimmed second lines meet AA for large text only.</li>
      </ul>

      <h2>Tell us</h2>
      <p>If something gets in your way, email {SITE.contactEmail} with the page and what happened. We aim to reply within 5 business days.</p>
    </LegalPage>
  );
}

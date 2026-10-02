import type { Metadata } from "next";
import { LegalPage } from "@/components/Prose";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Service · Orderable" };

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These terms cover this website, the hosted demo, the hosted MCP endpoint and the Orderable chat bots. The open-source code itself is covered by its MIT license."
    >
      <h2>1. Who you're dealing with</h2>
      <p>
        These terms are an agreement between you and {SITE.legalName} ("we"). By using the hosted services you agree to them. If you use them for a
        business, you confirm you can bind that business.
      </p>

      <h2>2. Who can use it</h2>
      <p>You must be at least 18. The hosted services are meant for businesses and adults ordering food.</p>

      <h2>3. What Orderable is</h2>
      <p>
        Orderable is software that lets AI agents read a food business's menu, availability and prices and place orders with it. We are not a
        restaurant, delivery company or payment processor, and we are not a party to any food order. The business that receives an order is
        responsible for the food, its preparation, allergens, fulfillment, pricing, payment and refunds.
      </p>
      <p>
        The live demo uses fictional businesses and runs with DRY_RUN on: demo orders are recorded but never sent to a kitchen and nothing is charged.
      </p>

      <h2>4. AI agents and their output</h2>
      <p>
        The chat bots use an AI model (Claude, by Anthropic) to understand requests and call Orderable's tools. AI output can be wrong. The agent shows
        you a quote and asks for your confirmation before placing any order; check the items, time and total before you say yes. Allergen
        information comes from the business. "Unknown" means the business has not said, and if you have a severe allergy you should confirm
        directly with the business.
      </p>

      <h2>5. Acceptable use</h2>
      <p>Don't:</p>
      <ul>
        <li>place fake, fraudulent or harassing orders with real businesses;</li>
        <li>impersonate a business or person, or connect a business you are not authorized to represent;</li>
        <li>overload, scrape or attack the hosted endpoints, or try to bypass tokens, signatures or spending limits;</li>
        <li>use the services to break the law or the terms of Telegram, Slack or another platform you connect.</li>
      </ul>
      <p>We may rate-limit, suspend or block access that breaks these rules.</p>

      <h2>6. Plans and payment</h2>
      <p>
        The open-source edition is free under the MIT license. Hosted plans are in early access and currently free. Before any paid plan starts we
        will show its price, what is billed and how to cancel, and you will choose to accept it. See the <a href="/refunds">Refund Policy</a>.
      </p>

      <h2>7. Your content</h2>
      <p>
        Menus, messages and order details you provide stay yours. You give us permission to process them only as needed to run the services. See the{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>8. Our software</h2>
      <p>
        The Orderable source code is licensed under the <a href={`${SITE.github}/blob/main/LICENSE`}>MIT license</a>. The Orderable name and this
        website's design are ours.
      </p>

      <h2>9. Third-party services</h2>
      <p>Telegram, Slack, GitHub, Vercel, Anthropic and any point-of-sale system you connect have their own terms, which apply to your use of them.</p>

      <h2>10. Ending things</h2>
      <p>You can stop using the services at any time. We may change or discontinue hosted services; we will give reasonable notice where we can.</p>

      <h2>11. Warranties and liability</h2>
      <p>
        The hosted services are provided as they are, without promises of uninterrupted availability. To the extent the law allows, we are not
        liable for indirect or consequential losses, or for the acts of businesses, couriers or platforms you order through. Nothing in these terms
        limits rights you have under consumer protection law that cannot be waived.
      </p>

      <h2>12. Law and disputes</h2>
      <p>
        These terms are governed by the laws of {SITE.governingLaw}. Please contact us first; most problems are fixed fastest by email.
      </p>

      <h2>13. Changes</h2>
      <p>We will update the date above when these terms change. For material changes to paid plans we will notify customers before they take effect.</p>

      <h2>14. Contact</h2>
      <p>
        {SITE.legalName}, {SITE.address} · {SITE.contactEmail}
      </p>
    </LegalPage>
  );
}

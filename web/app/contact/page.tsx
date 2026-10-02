import type { Metadata } from "next";
import { LegalPage } from "@/components/Prose";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Contact · Orderable" };

export default function Contact() {
  return (
    <LegalPage title="Contact" intro="A person reads every message.">
      <h2>Email</h2>
      <p>{SITE.contactEmail}: questions, privacy requests, billing, and accessibility.</p>

      <h2>Bugs and feature requests</h2>
      <p>
        Open an issue on <a href={`${SITE.github}/issues/new`}>GitHub</a>. For a security problem, please email instead of opening a public issue.
      </p>

      <h2>About an order</h2>
      <p>
        Orders go directly to the food business, which handles the food, delivery and refunds. Its contact details are on the order. Demo orders on
        this site are never sent to anyone.
      </p>

      <h2>Business details</h2>
      <p>
        {SITE.legalName}
        <br />
        {SITE.address}
      </p>
    </LegalPage>
  );
}

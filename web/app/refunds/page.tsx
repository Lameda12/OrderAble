import type { Metadata } from "next";
import { LegalPage } from "@/components/Prose";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Refund Policy · Orderable" };

export default function Refunds() {
  return (
    <LegalPage
      title="Refund Policy"
      intro="Nothing on Orderable costs money today. Here is how refunds work for food orders, and how they will work for paid hosted plans."
    >
      <h2>Food orders</h2>
      <p>
        Orderable doesn't take payment for food. You pay the business directly, at pickup, on invoice, or on the business's own payment page. Refunds
        and cancellations for an order follow that business's policy, which agents can read at <code>orderable://policies</code> and which the order
        shows as <code>cancellable_until</code>. Contact the business about a refund. The order confirmation includes its details.
      </p>
      <p>Demo orders on this site are never sent to a real business and never charged.</p>

      <h2>Open source and current hosted plans</h2>
      <p>The open-source edition and the early-access hosted plans are free, so there is nothing to refund.</p>

      <h2>Paid hosted plans, when they launch</h2>
      <ul>
        <li>Plans are billed monthly. Only completed orders count toward a plan's included orders or overage; cancelled and test-mode orders never do.</li>
        <li>You can cancel any time. Billing stops at cancellation; there are no cancellation fees.</li>
        <li>
          If we bill you in error, or for an order that didn't complete, email {SITE.contactEmail} within 30 days of the statement and we will
          refund it to the original payment method, normally within 10 business days.
        </li>
        <li>We will show the price and these terms before you choose a paid plan.</li>
      </ul>
      <p>
        This policy doesn't limit any refund or cancellation rights you have under consumer protection law, including Nova Scotia's rules on internet
        sales. If something looks wrong on a bill, please contact us before disputing the charge with your bank. It's usually faster.
      </p>

      <h2>Contact</h2>
      <p>{SITE.contactEmail}</p>
    </LegalPage>
  );
}

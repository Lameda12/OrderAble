import type { Metadata } from "next";
import { LegalPage } from "@/components/Prose";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Cookie Policy · Orderable" };

export default function Cookies() {
  return (
    <LegalPage
      title="Cookie Policy"
      intro="This site doesn't use cookies, local storage, tracking pixels or analytics. That's why you didn't see a cookie banner."
    >
      <h2>What we use</h2>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Used?</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Strictly necessary cookies</td>
            <td>None set by this site.</td>
          </tr>
          <tr>
            <td>Preferences, local or session storage</td>
            <td>None.</td>
          </tr>
          <tr>
            <td>Analytics</td>
            <td>None.</td>
          </tr>
          <tr>
            <td>Advertising and tracking pixels</td>
            <td>None.</td>
          </tr>
        </tbody>
      </table>
      <p>
        Our host, Vercel, may set a strictly necessary cookie only on password-protected preview deployments, never on this public site. The live
        demo talks to our API with ordinary requests and stores nothing in your browser.
      </p>

      <h2>If this changes</h2>
      <p>
        If we ever add analytics or other non-essential cookies, they will stay off until you agree, with "Reject" as easy as "Accept", and this page
        will list each one.
      </p>

      <h2>Contact</h2>
      <p>{SITE.contactEmail}</p>
    </LegalPage>
  );
}

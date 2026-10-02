import { SITE } from "@/lib/site";

const COLUMNS: [string, [string, string][]][] = [
  ["Product", [["Live demo", "/#demo"], ["For restaurants", "/#restaurants"], ["Pricing", "/#plans"], ["Try the endpoint", "/docs/connect"]]],
  ["Docs", [["Quickstart", "/docs"], ["Connect a client", "/docs/connect"], ["Tool reference", "/docs/tools"], ["For owners", "/docs/owners"]]],
  ["Open source", [["GitHub", SITE.github], ["MIT license", `${SITE.github}/blob/main/LICENSE`], ["Report an issue", `${SITE.github}/issues/new`]]],
  ["Legal", [["Terms", "/terms"], ["Privacy", "/privacy"], ["Refunds", "/refunds"], ["Cookies", "/cookies"], ["Accessibility", "/accessibility"], ["Contact", "/contact"]]],
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-cols">
        {COLUMNS.map(([title, links]) => (
          <div key={title}>
            <h2>{title}</h2>
            <ul>
              {links.map(([label, href]) => (
                <li key={label}>
                  <a href={href}>{label}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="footer-base">
        <span>
          © 2026 {SITE.legalName}. Orderable is open source under the MIT license.
        </span>
        <span>Crumb &amp; Co and Northline Coffee are fictional demo businesses. Halifax, Nova Scotia.</span>
      </div>
    </footer>
  );
}

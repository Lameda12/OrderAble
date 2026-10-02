import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Nav } from "./Nav";
import { SITE } from "@/lib/site";

/** Layout for legal pages: one readable column, last-updated date, draft notice. */
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <>
      <Nav />
      <main id="content" className="prose-page">
        <article className="prose">
          <p className="draft-note">Draft to be reviewed by a lawyer before relying on it for a regulated or high-revenue business.</p>
          <h1>{title}</h1>
          <p className="updated">Last updated {SITE.lastUpdated}</p>
          <p className="intro">{intro}</p>
          {children}
        </article>
      </main>
      <Footer />
    </>
  );
}

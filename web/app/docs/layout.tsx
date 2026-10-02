import type { ReactNode } from "react";
import { DocsNav } from "@/components/DocsNav";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <div className="docs">
        <DocsNav />
        <main id="content" className="prose docs-main">
          {children}
        </main>
      </div>
      <Footer />
    </>
  );
}

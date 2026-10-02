"use client";
import { usePathname } from "next/navigation";
import { DOCS } from "@/lib/docs";


export function DocsNav() {
  const path = usePathname();
  return (
    <nav className="docs-nav" aria-label="Documentation">
      <p>Documentation</p>
      <ul>
        {DOCS.map(([href, label]) => (
          <li key={href}>
            <a href={href} aria-current={path === href ? "page" : undefined}>
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

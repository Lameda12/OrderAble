import { SITE } from "@/lib/site";

/** Site-wide top bar. Links are absolute so they work from docs and legal pages too. */
export function Nav() {
  return (
    <>
      <a href="#content" className="skip">
        Skip to content
      </a>
      <nav className="nav" aria-label="Main">
        <a href="/" className="wordmark">
          <i aria-hidden />
          Orderable
        </a>
        <div className="nav-links">
          <a href="/#demo" className="nav-keep">Demo</a>
          <a href="/#channels">Chat apps</a>
          <a href="/#plans">Plans</a>
          <a href="/docs" className="nav-keep">Docs</a>
          <a href={SITE.github} className="nav-keep">GitHub</a>
        </div>
      </nav>
    </>
  );
}

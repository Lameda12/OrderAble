import { ENDORSEMENTS } from "@/lib/proof";
import { Reveal } from "./Reveal";

/** Renders nothing until there is at least one real, linked, permitted endorsement. */
export function Proof() {
  if (ENDORSEMENTS.length === 0) return null;
  return (
    <section className="section" id="proof">
      <Reveal>
        <h2 className="headline md">
          Don’t take our word for it.
          <br />
          <span className="dim">Take theirs.</span>
        </h2>
      </Reveal>
      <div className="pillars">
        {ENDORSEMENTS.map((e, i) => (
          <Reveal key={e.url} className="tile" delay={(i % 3) as 0 | 1 | 2}>
            <p style={{ color: "var(--text)", fontSize: 20, lineHeight: 1.4 }}>“{e.quote}”</p>
            <div className="specimen">
              <div>{e.name}</div>
              <div className="k">
                {e.role}
                {e.handle ? ` · ${e.handle}` : ""}
              </div>
              {e.disclosure && <div className="k">{e.disclosure}</div>}
              <div>
                <a className="textlink" style={{ fontSize: 13 }} href={e.url}>
                  View original ›
                </a>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

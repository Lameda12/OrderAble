import { DOCS } from "@/lib/docs";

/** "Next page" link at the bottom of a docs page. */
export function DocNext({ from }: { from: string }) {
  const i = DOCS.findIndex(([href]) => href === from);
  const next = DOCS[i + 1];
  if (!next) return null;
  return (
    <div className="next">
      <a href={next[0]}>Next: {next[1]} ›</a>
    </div>
  );
}

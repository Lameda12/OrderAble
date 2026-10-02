/** Tiny JSON syntax highlighter: keys, strings, numbers/booleans. */
export function JsonView({ value }: { value: unknown }) {
  const json = JSON.stringify(value, null, 2) ?? "";
  const parts: React.ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(json))) {
    if (m.index > last) parts.push(json.slice(last, m.index));
    if (m[1] && m[2]) parts.push(<span key={i++} className="k">{m[1]}</span>, m[2]);
    else if (m[1]) parts.push(<span key={i++} className="s">{m[1]}</span>);
    else parts.push(<span key={i++} className="n">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  parts.push(json.slice(last));
  return <>{parts}</>;
}

export const dollars = (m?: { amount: number } | null) => (m ? `$${(m.amount / 100).toFixed(2)}` : "");

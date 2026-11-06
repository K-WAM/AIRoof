import type { CSSProperties } from "react";
import type { RenderedLetter } from "./letters";

/** `classic` (documentStyle): headings bold italic underlined, as on a contractor's typed letter. */
export function LetterBody({ letter, classic = false }: { letter: RenderedLetter; classic?: boolean }) {
  const heading: CSSProperties = classic ? { fontSize: 15, fontStyle: "italic", fontWeight: 700, textDecoration: "underline", margin: "0 0 6px" } : { fontSize: 15 };
  return <div className="k1-letter">{letter.blocks.map((block, i) => <section key={i} style={{ margin: classic ? "14px 0" : "20px 0" }}>
    {block.heading && <h3 style={heading}>{block.heading}</h3>}
    {block.paragraphs.map((p, j) => <p key={j} style={{ whiteSpace: "pre-wrap", lineHeight: 1.65, ...(classic ? { margin: "6px 0" } : {}) }}>{p}</p>)}
    {block.bullets && <ul>{block.bullets.map((bullet, j) => <li key={j} style={{ marginBottom: 8 }}>{bullet}</li>)}</ul>}
  </section>)}</div>;
}

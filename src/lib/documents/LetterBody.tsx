import type { RenderedLetter } from "./letters";

export function LetterBody({ letter }: { letter: RenderedLetter }) {
  return <div className="k1-letter">{letter.blocks.map((block, i) => <section key={i} style={{ margin: "20px 0" }}>
    {block.heading && <h3 style={{ fontSize: 15 }}>{block.heading}</h3>}
    {block.paragraphs.map((p, j) => <p key={j} style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{p}</p>)}
    {block.bullets && <ul>{block.bullets.map((bullet, j) => <li key={j} style={{ marginBottom: 8 }}>{bullet}</li>)}</ul>}
  </section>)}</div>;
}

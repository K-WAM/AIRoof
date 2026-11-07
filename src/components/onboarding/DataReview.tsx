import type { OnboardingDataReview } from "@/types/onboarding";
import s from "./onboarding.module.css";
export function PlainText({ text }: { text: string }) {
  const blocks: Array<{ bullet: boolean; lines: string[] }> = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) { blocks.push({ bullet: false, lines: [] }); continue; }
    const bullet = line.startsWith("- ");
    const previous = blocks.at(-1);
    if (previous && previous.bullet === bullet) previous.lines.push(bullet ? line.slice(2) : line);
    else blocks.push({ bullet, lines: [bullet ? line.slice(2) : line] });
  }
  return <>{blocks.filter(b => b.lines.length).map((block, i) => block.bullet ? <ul key={i}>{block.lines.map((line, j) => <li key={j}>{line}</li>)}</ul> : <p key={i} style={{ whiteSpace: "pre-line" }}>{block.lines.join("\n")}</p>)}</>;
}
export function DataReview({ review }: { review?: OnboardingDataReview }) {
  if (!review || (!review.intro && !review.sections.length)) return null;
  return <section className={`${s.section} ${s.card}`}><h2>{review.title || "What we found in your data"}</h2><p>{review.intro}</p>{review.sections.map((section, i) => <div key={i}><h3>{section.heading}</h3><PlainText text={section.body} /></div>)}</section>;
}

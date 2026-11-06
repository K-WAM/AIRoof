import type { RenderedLetter } from "./letters";
import { escapeHtml as esc } from "./letterhead";

/** `classic` (documentStyle): headings bold italic underlined, like the in-app LetterBody. */
export function letterHtml(letter: RenderedLetter, classic = false): string {
  const h3 = classic ? ' style="font-size:15px;font-style:italic;font-weight:700;text-decoration:underline;margin:0 0 6px"' : "";
  return letter.blocks.map(block => `<section style="margin:${classic ? "14px" : "20px"} 0">${block.heading ? `<h3${h3}>${esc(block.heading)}</h3>` : ""}${block.paragraphs.map(p => `<p style="white-space:pre-wrap;line-height:1.65">${esc(p)}</p>`).join("")}${block.bullets ? `<ul>${block.bullets.map(b => `<li style="margin-bottom:8px">${esc(b)}</li>`).join("")}</ul>` : ""}</section>`).join("");
}
export function signatureHtml(name: string, title: string, authorize: boolean): string {
  return `<section style="margin-top:32px;border-top:1px solid #cbd5e1;padding-top:20px"><p>${authorize ? "Authorized" : "Accepted"} by: ____________________</p><p>Date: ____________________</p><p>Printed name: ____________________</p>${name ? `<p>${esc(name)}<br/>${esc(title)}</p>` : ""}</section>`;
}

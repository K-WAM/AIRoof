import type { RenderedLetter } from "./letters";
import { escapeHtml as esc } from "./letterhead";

export function letterHtml(letter: RenderedLetter): string {
  return letter.blocks.map(block => `<section style="margin:20px 0">${block.heading ? `<h3>${esc(block.heading)}</h3>` : ""}${block.paragraphs.map(p => `<p style="white-space:pre-wrap;line-height:1.65">${esc(p)}</p>`).join("")}${block.bullets ? `<ul>${block.bullets.map(b => `<li style="margin-bottom:8px">${esc(b)}</li>`).join("")}</ul>` : ""}</section>`).join("");
}
export function signatureHtml(name: string, title: string, authorize: boolean): string {
  return `<section style="margin-top:32px;border-top:1px solid #cbd5e1;padding-top:20px"><p>${authorize ? "Authorized" : "Accepted"} by: ____________________</p><p>Date: ____________________</p><p>Printed name: ____________________</p>${name ? `<p>${esc(name)}<br/>${esc(title)}</p>` : ""}</section>`;
}

import type { JobFinding } from "@/types/workCatalog";
import { reportFindings } from "./findings";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function reportFindingsHtml(findings: JobFinding[] | undefined): string {
  const selected = reportFindings(findings);
  if (!selected.length) return "";
  const colors = { high: "#b91c1c", medium: "#92400e", low: "#15803d" };
  return `<div style="margin:0 0 24px"><div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#475569;margin-bottom:8px">Issues found &amp; work performed / recommended</div>${selected.map((f) => `<div style="padding:10px 14px;border-left:4px solid ${colors[f.severity ?? "low"]};background:#f8fafc;border-radius:6px;margin-bottom:6px;font-size:14px">${f.severity ? `<strong style="text-transform:uppercase;font-size:10px;color:${colors[f.severity]}">${esc(f.severity)}</strong> ` : ""}<strong>${esc(f.problem)}</strong>${f.solution ? `<div style="white-space:pre-wrap;margin-top:4px">${esc(f.solution)}</div>` : ""}</div>`).join("")}</div>`;
}

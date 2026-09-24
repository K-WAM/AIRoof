import type { JobFinding, WorkCatalogItem, WorkCatalogLine } from "@/types/workCatalog";
import type { JobInvoice } from "@/types/invoice";
import type { LibraryPricing } from "@/types/library";
import { computeTotals } from "@/app/company/jobs/[jobId]/jobInvoice";

const plain = (value: unknown, max: number) => typeof value === "string" && value.length <= max && !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const keysOnly = (value: object, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));
const money = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000;

export function validFinding(value: unknown): value is JobFinding {
  if (!value || typeof value !== "object") return false;
  const f = value as Partial<JobFinding>;
  return keysOnly(f, ["findingId", "itemId", "category", "problem", "solution", "severity", "lines", "includeInReport", "includeInQuote", "addedAt"]) &&
    plain(f.findingId, 100) && !!f.findingId &&
    (f.itemId === undefined || plain(f.itemId, 100)) && plain(f.category, 100) &&
    plain(f.problem, 1000) && !!f.problem?.trim() && plain(f.solution, 2000) &&
    (f.severity === undefined || ["low", "medium", "high"].includes(f.severity)) &&
    typeof f.includeInReport === "boolean" && typeof f.includeInQuote === "boolean" &&
    typeof f.addedAt === "number" && Number.isFinite(f.addedAt) &&
    (f.lines === undefined || (Array.isArray(f.lines) && f.lines.length <= 20 && f.lines.every(validLine)));
}

export function validFindings(value: unknown): value is JobFinding[] {
  return Array.isArray(value) && value.length <= 60 && value.every(validFinding) &&
    new Set(value.map((f: JobFinding) => f.findingId)).size === value.length &&
    new Set(value.filter((f: JobFinding) => f.itemId).map((f: JobFinding) => f.itemId)).size === value.filter((f: JobFinding) => f.itemId).length;
}

export function validLine(value: unknown): value is WorkCatalogLine {
  if (!value || typeof value !== "object") return false;
  const line = value as Partial<WorkCatalogLine>;
  return keysOnly(line, ["description", "quantity", "unit", "unitPrice", "kind"]) &&
    plain(line.description, 500) && !!line.description?.trim() &&
    (line.unit === undefined || plain(line.unit, 40)) &&
    money(line.quantity) && (line.quantity ?? 0) > 0 && money(line.unitPrice) &&
    ["material", "labor", "other"].includes(line.kind ?? "");
}

export function copyCatalogFinding(item: WorkCatalogItem): JobFinding {
  return {
    findingId: crypto.randomUUID(), itemId: item.itemId, category: item.category,
    problem: item.problem, solution: item.solution, severity: item.severity,
    lines: item.lines?.map((line) => ({ ...line })),
    includeInReport: true, includeInQuote: true, addedAt: Date.now(),
  };
}

export function reportFindings(findings: JobFinding[] | undefined): JobFinding[] {
  return (findings ?? []).filter((f) => f.includeInReport);
}

/** Deterministic IDs survive repeated imports; existing rows, including crew rows, stay intact. */
export function addFindingsToInvoice(invoice: JobInvoice, findings: JobFinding[], library: LibraryPricing | null): JobInvoice {
  if (invoice.status !== "draft") return invoice;
  const labor = [...invoice.labor];
  const materials = [...invoice.materials];
  const other = [...invoice.other];
  for (const finding of findings) for (const [index, line] of (finding.lines ?? []).entries()) {
    const lineId = `finding_${finding.findingId}_${index}`;
    if ([...labor, ...materials, ...other].some((row) => row.lineId === lineId)) continue;
    if (line.kind === "material") {
      const match = library?.materials.find((m) => m.name.trim().toLocaleLowerCase() === line.description.trim().toLocaleLowerCase());
      const unitPrice = match?.unitPrice ?? line.unitPrice;
      materials.push({ lineId, item: line.description, quantity: line.quantity, unit: line.unit, unitPrice,
        total: Math.round(line.quantity * unitPrice * 100) / 100, source: match ? "catalog" : "manual" });
    } else if (line.kind === "labor") {
      labor.push({ lineId, name: line.description, hours: line.quantity, rate: line.unitPrice,
        total: Math.round(line.quantity * line.unitPrice * 100) / 100, source: "manual" });
    } else {
      other.push({ lineId, description: line.description, amount: Math.round(line.quantity * line.unitPrice * 100) / 100 });
    }
  }
  return { ...invoice, labor, materials, other, ...computeTotals({ labor, materials, other, taxRate: invoice.taxRate, discount: invoice.discount }) };
}

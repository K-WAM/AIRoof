// One compact line per billing company under a superadmin client row (T-317). Small, plain words, money in dollars.

import type { CompanySplitLine } from "@/lib/admin/overview";
import { fmtMoney } from "@/lib/format/money";

const count = (value: number, one: string, many = `${one}s`) => `${value} ${value === 1 ? one : many}`;

export function companySplitText(line: CompanySplitLine): string {
  return [
    line.shortName,
    count(line.calls, "call"),
    `${line.phoneMinutes} min`,
    count(line.notes, "field note"),
    count(line.jobs, "job"),
    `${fmtMoney(line.invoiced)} invoiced`,
    `${fmtMoney(line.collected)} collected`,
    `${fmtMoney(line.cost)} cost`,
  ].join(" · ");
}

export function CompanySplitLines({ lines, testId }: { lines: readonly CompanySplitLine[] | undefined; testId?: string }) {
  if (!lines || lines.length === 0) return null;
  return (
    <div data-testid={testId} style={{ display: "grid", gap: 2 }}>
      {lines.map((line) => (
        <p key={line.companyId} className="cell-note" style={{ margin: 0 }}>
          {companySplitText(line)}
        </p>
      ))}
    </div>
  );
}

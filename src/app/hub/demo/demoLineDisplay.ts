import type { PhoneLineView } from "@/types/phoneLine";

const STATUS_ORDER: Record<PhoneLineView["status"], number> = {
  live: 5, test_passed: 4, connected: 3, provisioned: 2, draft: 1, retired: 0,
};

export function distinctLines(lines: PhoneLineView[]): Array<{ line: PhoneLineView; records: number }> {
  const grouped = new Map<string, { line: PhoneLineView; records: number }>();
  for (const line of lines) {
    const current = grouped.get(line.e164);
    if (!current) grouped.set(line.e164, { line, records: 1 });
    else grouped.set(line.e164, {
      line: STATUS_ORDER[line.status] > STATUS_ORDER[current.line.status] ? line : current.line,
      records: current.records + 1,
    });
  }
  return [...grouped.values()];
}

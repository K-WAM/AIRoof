interface ExpectedFieldFact {
  collection: "timeline" | "materials" | "labor" | "issues" | "correction";
  matchField?: string;
  matchIncludes?: string;
  field: string;
  expected: string | number;
}

export interface FieldNoteAccuracyFixture {
  name: string;
  source: string;
  transcript: string;
  facts: ExpectedFieldFact[];
}

// Anonymized field-note wording already captured in repository docs/tests. These
// are deliberately messy voice-note sentences rather than idealized JSON inputs.
export const fieldNoteAccuracyFixtures: FieldNoteAccuracyFixture[] = [
  {
    name: "roof replacement site update",
    source: "docs/HANDOFF.md",
    transcript:
      "We replaced 14 squares of shingles on the north face. Crew was Marco and Dani. We left the shop at 7:30, got there at 8. Found rotted decking near the chimney — about 6 square feet. Job took 3 hours. Need to come back for the flashing.",
    facts: [
      { collection: "materials", matchField: "item", matchIncludes: "shingle", field: "quantity", expected: "14" },
      { collection: "labor", matchField: "description", matchIncludes: "marco", field: "description", expected: "marco" },
      { collection: "labor", matchField: "description", matchIncludes: "dani", field: "description", expected: "dani" },
      { collection: "labor", matchField: "description", matchIncludes: "marco", field: "hours", expected: 3 },
      { collection: "issues", matchField: "description", matchIncludes: "rotted", field: "severity", expected: "high" },
    ],
  },
  {
    name: "invoice preparation note",
    source: "docs/plans/invoice-from-field-updates-and-ui-facelift.md",
    transcript:
      "Left office 9am, 3 laborers, 6 bundles shingles, 2 rolls underlayment, drip edge needed, prep invoice.",
    facts: [
      { collection: "timeline", matchField: "description", matchIncludes: "left", field: "time", expected: "09:00" },
      { collection: "materials", matchField: "item", matchIncludes: "shingle", field: "quantity", expected: "6" },
      { collection: "materials", matchField: "item", matchIncludes: "underlayment", field: "quantity", expected: "2" },
      { collection: "issues", matchField: "description", matchIncludes: "drip edge", field: "severity", expected: "medium" },
    ],
  },
  {
    name: "priced materials and labor",
    source: "src/lib/ai/__tests__/ai-hardening.test.ts",
    transcript:
      "25 squares of shingles at $85 per square, Alex worked 7.5 hours.",
    facts: [
      { collection: "materials", matchField: "item", matchIncludes: "shingle", field: "quantity", expected: "25" },
      { collection: "materials", matchField: "item", matchIncludes: "shingle", field: "cost", expected: 2125 },
      { collection: "labor", matchField: "description", matchIncludes: "alex", field: "hours", expected: 7.5 },
    ],
  },
  {
    name: "spoken correction",
    source: "docs/EPIC-PLAN.md",
    transcript:
      "Correction on the 2x4s — never mind, it was 120, not 150.",
    facts: [
      { collection: "correction", field: "item", expected: "2x4" },
      { collection: "correction", field: "newValue", expected: 120 },
      { collection: "correction", field: "field", expected: "materials" },
    ],
  },
];

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function scoreFieldNoteOutput(
  fixture: FieldNoteAccuracyFixture,
  output: Record<string, unknown>,
): { passed: number; total: number; missed: string[] } {
  const missed: string[] = [];
  let passed = 0;

  for (const fact of fixture.facts) {
    const rawCollection = output[fact.collection];
    const entries = Array.isArray(rawCollection)
      ? rawCollection
      : rawCollection && typeof rawCollection === "object"
        ? [rawCollection]
        : [];
    const entry = fact.matchField
      ? entries.find((candidate) => {
          if (!candidate || typeof candidate !== "object") return false;
          return normalized((candidate as Record<string, unknown>)[fact.matchField!])
            .includes(normalized(fact.matchIncludes));
        })
      : entries[0];
    const actual = entry && typeof entry === "object"
      ? (entry as Record<string, unknown>)[fact.field]
      : undefined;
    const matches = typeof fact.expected === "number"
      ? Number(actual) === fact.expected
      : normalized(actual).includes(normalized(fact.expected));

    if (matches) {
      passed += 1;
    } else {
      missed.push(`${fixture.name}: ${fact.collection}.${fact.field}=${String(fact.expected)}`);
    }
  }

  return { passed, total: fixture.facts.length, missed };
}

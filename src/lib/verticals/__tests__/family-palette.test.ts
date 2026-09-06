import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VERTICAL_TEMPLATES, type VisualFamily } from "../templates";

// T-056 — per-industry visual families. Reads the *actual* globals.css rather
// than a duplicated copy of the hex values, so this test can't drift from
// what a tenant's browser really renders.
const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

function relativeLuminance(hex: string): number {
  const n = hex.replace("#", "");
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(n.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG contrast ratio — symmetric, so this is also the ratio a family's
// accent gets when used as `color:` on a white surface, or as a button
// background under white text.
function contrastAgainstWhite(hex: string): number {
  const l1 = relativeLuminance(hex);
  const l2 = 1; // white
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function extractAccent(scopeStart: string): string {
  const from = css.indexOf(scopeStart);
  if (from === -1) throw new Error(`Could not find "${scopeStart}" in globals.css`);
  const block = css.slice(from, css.indexOf("}", from));
  const match = block.match(/--accent:\s*(#[0-9a-fA-F]{6});/);
  if (!match) throw new Error(`No --accent declaration inside "${scopeStart}"'s block`);
  return match[1].toLowerCase();
}

// "field" has no override block — every vertical in that family renders the
// default :root teal, so its accent comes from :root itself.
const FAMILY_ACCENTS: Record<VisualFamily, string> = {
  field: extractAccent(":root {"),
  care: extractAccent('[data-portal-family="care"]'),
  ops: extractAccent('[data-portal-family="ops"]'),
};

describe("T-056 per-industry visual families", () => {
  it.each(Object.entries(FAMILY_ACCENTS))(
    "%s family's accent clears 4.5:1 contrast against white",
    (_family, hex) => {
      expect(contrastAgainstWhite(hex)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("gives each family a visually distinct accent", () => {
    const values = Object.values(FAMILY_ACCENTS);
    expect(new Set(values).size).toBe(values.length);
  });

  it("assigns every vertical template a family", () => {
    for (const template of Object.values(VERTICAL_TEMPLATES)) {
      expect(["field", "care", "ops"]).toContain(template.family);
    }
  });

  it("groups verticals the way the spec proposed (field/dispatch, care/intake, ops)", () => {
    const byFamily = Object.values(VERTICAL_TEMPLATES).reduce<Record<VisualFamily, string[]>>(
      (acc, t) => {
        acc[t.family].push(t.verticalId);
        return acc;
      },
      { field: [], care: [], ops: [] },
    );
    expect(byFamily.care.sort()).toEqual(["childcare", "dental"]);
    expect(byFamily.ops).toEqual(["property-management"]);
    expect(byFamily.field).toHaveLength(7);
  });
});

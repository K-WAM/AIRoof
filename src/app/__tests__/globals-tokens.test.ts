import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T-114 contrast/token audit guard. Pins the app-shell color decisions to the
 * tokens in globals.css (not per-page overrides) and computes real WCAG
 * contrast ratios for the tokens the audit flagged.
 */

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`CSS token --${name} not found in globals.css`);
  return match[1].trim();
}

function cssBlock(selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector ${selector} not found in globals.css`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  if (open === -1 || close === -1) throw new Error(`could not read block for ${selector}`);
  return css.slice(open + 1, close);
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "").trim();
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe("globals.css tokens (T-114)", () => {
  it("keeps muted text at WCAG AA on both light surfaces", () => {
    const muted = token("text-muted");
    expect(contrast(muted, token("surface"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(muted, token("background"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("c-neutral-fg"), token("c-neutral-bg"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the disabled button readable through tokens instead of an opacity fade", () => {
    const block = cssBlock(".button:disabled");
    expect(block).toContain("var(--text-muted)");
    expect(block).toContain("var(--surface-muted)");
    expect(block).not.toMatch(/opacity:\s*0?\.\d+/);
    // The exact pair the disabled Send button renders with.
    expect(contrast(token("text-muted"), token("surface-muted"))).toBeGreaterThanOrEqual(4.5);
  });

  it("resets the nav-link button styling so the dark-sidebar Feedback item is not a pale box", () => {
    const block = cssBlock(".nav-link");
    expect(block).toContain("background: none");
    expect(block).toMatch(/min-height:\s*40px/);
    expect(block).toContain("border: 0");
  });

  it("tokenizes the active company-nav accent instead of hard-coding teal", () => {
    const block = cssBlock('.company-nav a[aria-current="page"]');
    expect(block).toContain("var(--accent)");
    expect(block).not.toContain("#0f766e");
  });

  it("uses one shared backdrop token for Modal and Sheet", () => {
    expect(cssBlock(".modal-overlay")).toContain("var(--backdrop)");
    expect(cssBlock(".sheet-backdrop")).toContain("var(--backdrop)");
  });
});

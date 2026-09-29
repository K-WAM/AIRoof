import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T-157 (C-D): the design tokens in globals.css are the only colours in the
 * system, so they must clear WCAG AA (4.5:1) for the text/background pairs
 * that actually appear together. This parses `:root` and checks every state
 * tone's `-fg` on its own `-bg`, plus `--text-muted` on `--surface`.
 */

const CSS_PATH = resolve(process.cwd(), "src/app/globals.css");

function readRootBlock(): string {
  const css = readFileSync(CSS_PATH, "utf8");
  const start = css.indexOf(":root");
  expect(start, ":root block present in globals.css").toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function token(root: string, name: string): string {
  const match = root.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  expect(match, `token ${name} defined`).toBeTruthy();
  return match![1].trim();
}

function parseHex(value: string): [number, number, number] {
  const hex = value.replace("#", "").trim();
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  expect(full, `hex value ${value}`).toMatch(/^[0-9a-fA-F]{6}$/);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: string, bg: string): number {
  const l1 = relativeLuminance(parseHex(fg));
  const l2 = relativeLuminance(parseHex(bg));
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe("design tokens (T-157)", () => {
  const root = readRootBlock();
  const TONES = ["danger", "success", "info", "warn", "neutral"] as const;

  it("defines the Phase 32 spacing and control-height scale", () => {
    expect(token(root, "--sp-1")).toBe("4px");
    expect(token(root, "--sp-2")).toBe("8px");
    expect(token(root, "--sp-3")).toBe("12px");
    expect(token(root, "--sp-4")).toBe("16px");
    expect(token(root, "--sp-5")).toBe("24px");
    expect(token(root, "--sp-6")).toBe("32px");
    expect(token(root, "--control-h")).toBe("44px");
  });

  it.each(TONES)("state tone %s text clears 4.5:1 on its own background", (tone) => {
    const fg = token(root, `--c-${tone}-fg`);
    const bg = token(root, `--c-${tone}-bg`);
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("--text-muted clears 4.5:1 on --surface", () => {
    expect(contrast(token(root, "--text-muted"), token(root, "--surface"))).toBeGreaterThanOrEqual(4.5);
  });
});

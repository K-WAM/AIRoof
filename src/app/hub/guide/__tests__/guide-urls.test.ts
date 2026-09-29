import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T-167: user-facing guide assets must never send an operator to the old
 * deployment, localhost or a raw loopback address. Temporary ops-only escapes
 * are allowed, but only when explicitly marked with `data-ops-fallback`.
 */

const GUIDES_DIR = resolve(process.cwd(), "public/guides");
const FORBIDDEN = [/ai-roof\.vercel\.app/i, /localhost/i, /127\.0\.0\.1/];

/** Remove every element explicitly marked as an ops fallback before scanning. */
function stripOpsFallbacks(html: string): string {
  let out = html;
  const OPEN = /<([a-zA-Z][\w-]*)\b[^>]*\bdata-ops-fallback\b[^>]*>/i;
  for (let guard = 0; guard < 50; guard += 1) {
    const match = OPEN.exec(out);
    if (!match) break;
    const start = match.index;
    const close = out.indexOf(`</${match[1]}>`, start + match[0].length);
    const end = close === -1 ? out.length : close + `</${match[1]}>`.length;
    out = out.slice(0, start) + out.slice(end);
  }
  return out;
}

describe("public/guides assets (T-167)", () => {
  const files = readdirSync(GUIDES_DIR).filter((name) => name.endsWith(".html"));

  it("has guide assets to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s has no stale app, localhost or loopback URL", (file) => {
    const html = stripOpsFallbacks(readFileSync(resolve(GUIDES_DIR, file), "utf8"));
    for (const pattern of FORBIDDEN) {
      const match = html.match(pattern);
      expect(match?.[0], `${file} matched ${pattern}`).toBeUndefined();
    }
  });
});

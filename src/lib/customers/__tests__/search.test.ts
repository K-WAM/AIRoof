import { describe, it, expect } from "vitest";
import { buildSearchTokens, buildMatchKey, tokenForQuery, matchesQuery } from "@/lib/customers/search";

describe("buildSearchTokens", () => {
  it("emits every prefix length 2..12 of each word in the name", () => {
    const tokens = buildSearchTokens({ name: "Walmart" });
    expect(tokens).toEqual(["wa", "wal", "walm", "walma", "walmar", "walmart"]);
  });

  it("is diacritic-insensitive — José indexes the same as Jose", () => {
    const withAccent = buildSearchTokens({ name: "José Martínez" });
    const without = buildSearchTokens({ name: "Jose Martinez" });
    expect(withAccent).toEqual(without);
    expect(withAccent).toContain("jose");
    expect(withAccent).toContain("mart");
  });

  it("drops stopwords like 'the' and 'llc'", () => {
    const tokens = buildSearchTokens({ name: "The Acme Company LLC" });
    expect(tokens).not.toContain("th"); // "the" fully excluded, not just shortened
    expect(tokens.some((t) => t.startsWith("ac"))).toBe(true);
  });

  it("indexes phone last-4 and last-7 digit suffixes", () => {
    const tokens = buildSearchTokens({ name: "X", phone: "+1 (305) 555-0123" });
    expect(tokens).toContain("0123");
    expect(tokens).toContain("5550123");
  });

  it("indexes contact names and phones too", () => {
    const tokens = buildSearchTokens({ name: "Walmart #2291", contacts: [{ name: "Kevin Reyes", phone: "3055551234" }] });
    expect(tokens.some((t) => t.startsWith("kev"))).toBe(true);
    expect(tokens).toContain("1234");
  });

  it("indexes address words", () => {
    const tokens = buildSearchTokens({ name: "X", address: "123 Main Street, Miami" });
    expect(tokens.some((t) => t.startsWith("mia"))).toBe(true);
  });

  it("caps at 250 tokens, prioritizing name over address", () => {
    const longAddress = Array.from({ length: 60 }, (_, i) => `streetword${i}`).join(" ");
    const tokens = buildSearchTokens({ name: "Priority Name Here", address: longAddress });
    expect(tokens.length).toBeLessThanOrEqual(250);
    expect(tokens.some((t) => t.startsWith("pri"))).toBe(true);
  });

  it("keeps a short word/initial searchable even below the 2-char minimum", () => {
    const tokens = buildSearchTokens({ name: "J Smith" });
    expect(tokens).toContain("j");
  });

  it("never includes empty tokens for missing fields", () => {
    const tokens = buildSearchTokens({ name: "Acme" });
    expect(tokens.every((t) => t.length > 0)).toBe(true);
  });
});

describe("buildMatchKey", () => {
  it("combines normalized name and phone-last-7", () => {
    expect(buildMatchKey({ name: "Walmart #2291", phone: "+1 (305) 555-0123" })).toBe("walmart #2291|5550123");
  });

  it("is the same for equivalent inputs regardless of accents/case/phone formatting", () => {
    const a = buildMatchKey({ name: "José Martínez", phone: "(305) 555-0123" });
    const b = buildMatchKey({ name: "JOSE MARTINEZ", phone: "3055550123" });
    expect(a).toBe(b);
  });

  it("still produces a stable key with no phone", () => {
    expect(buildMatchKey({ name: "Jane Smith" })).toBe("jane smith|");
  });

  it("differs for different names with the same phone", () => {
    const a = buildMatchKey({ name: "Jane Smith", phone: "3055550123" });
    const b = buildMatchKey({ name: "John Smith", phone: "3055550123" });
    expect(a).not.toBe(b);
  });
});

describe("tokenForQuery", () => {
  it("matches a name-prefix query the same way buildSearchTokens indexed it", () => {
    const indexed = buildSearchTokens({ name: "Walmart" });
    expect(indexed).toContain(tokenForQuery("wal"));
  });

  it("matches a full digit phone snippet the same way buildSearchTokens indexed it", () => {
    const indexed = buildSearchTokens({ name: "X", phone: "3055550123" });
    expect(indexed).toContain(tokenForQuery("0123"));
    expect(indexed).toContain(tokenForQuery("5550123"));
  });

  it("truncates a long name query to the 12-char index cap", () => {
    const indexed = buildSearchTokens({ name: "Extraordinarily" });
    expect(indexed).toContain(tokenForQuery("extraordinarily"));
  });
});

describe("matchesQuery (client-side instant filter)", () => {
  it("matches a name prefix", () => {
    expect(matchesQuery({ name: "Walmart #2291" }, "wal")).toBe(true);
  });

  it("matches a mid-string word, not just the leading word", () => {
    expect(matchesQuery({ name: "Kevin Reyes" }, "reyes")).toBe(true);
  });

  it("is diacritic-insensitive", () => {
    expect(matchesQuery({ name: "José Martínez" }, "jose")).toBe(true);
  });

  it("matches a phone digit snippet", () => {
    expect(matchesQuery({ name: "X", phone: "+1 (305) 555-0123" }, "0123")).toBe(true);
  });

  it("does not match an unrelated query", () => {
    expect(matchesQuery({ name: "Walmart #2291" }, "kevin")).toBe(false);
  });

  it("returns false for an empty query", () => {
    expect(matchesQuery({ name: "Walmart" }, "")).toBe(false);
  });
});

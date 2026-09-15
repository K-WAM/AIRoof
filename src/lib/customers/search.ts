// Pure, unit-tested logic for customer search/dedup identity. No Firestore,
// no fetch — src/app/api/company/customers/* and scripts/backfill-customers.mjs
// both import this so "same customer" and "how a query matches" are defined
// in exactly one place.
import { normalizeName, digitsOnly } from "@/lib/format";

const STOPWORDS = new Set(["the", "inc", "llc", "corp", "co", "company", "and", "of", "a", "an", "&"]);
const MIN_PREFIX = 2;
const MAX_PREFIX = 12;
const MAX_TOKENS = 250;

function wordsFrom(s: string | undefined): string[] {
  return normalizeName(s ?? "")
    .split(" ")
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w));
}

/** Every prefix length 2..12 of a word — "walmart" -> wa, wal, walm, ... walmart. */
function prefixesFor(word: string): string[] {
  if (word.length < MIN_PREFIX) return [word]; // keep short words/initials searchable
  const out: string[] = [];
  const max = Math.min(word.length, MAX_PREFIX);
  for (let len = MIN_PREFIX; len <= max; len++) out.push(word.slice(0, len));
  return out;
}

/** Last-4 and last-7 digit suffixes, so "1234" or a 7-digit local number both hit. */
function phoneTokens(phone: string | undefined): string[] {
  const digits = digitsOnly(phone);
  const out: string[] = [];
  if (digits.length >= 4) out.push(digits.slice(-4));
  if (digits.length >= 7) out.push(digits.slice(-7));
  return out;
}

export interface SearchTokenInput {
  name?: string;
  phone?: string;
  address?: string;
  contacts?: Array<{ name?: string; phone?: string }>;
}

/**
 * Deterministic priority (name -> contacts -> address) so truncation at the
 * cap drops the least useful tokens first, never the customer's own name.
 * Capped at 250 — an unbounded token array burns index-write cost on every
 * update for no real search benefit past that.
 */
export function buildSearchTokens(input: SearchTokenInput): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  function add(list: string[]) {
    for (const t of list) {
      if (tokens.length >= MAX_TOKENS) return;
      if (!t || seen.has(t)) continue;
      seen.add(t);
      tokens.push(t);
    }
  }

  for (const w of wordsFrom(input.name)) add(prefixesFor(w));
  add(phoneTokens(input.phone));
  for (const c of input.contacts ?? []) {
    for (const w of wordsFrom(c.name)) add(prefixesFor(w));
    add(phoneTokens(c.phone));
  }
  for (const w of wordsFrom(input.address)) add(prefixesFor(w));

  return tokens.slice(0, MAX_TOKENS);
}

/**
 * The identity used to find-or-create a customer: normalized name + the
 * phone's last 7 digits. Two jobs for "Walmart #2291" with the same phone
 * resolve to one customer; a bare name with no phone still dedupes on name
 * alone (weaker, but still collapses the common case of typing the same
 * name twice).
 */
export function buildMatchKey(input: { name?: string; phone?: string }): string {
  const normName = normalizeName(input.name ?? "");
  const last7 = digitsOnly(input.phone).slice(-7);
  return `${normName}|${last7}`;
}

/**
 * Turns a raw search-box query into the single token to look up with
 * `.where("searchTokens", "array-contains", token)` — must stay in exact
 * sync with how buildSearchTokens indexes (name prefixes 2..12 chars,
 * phone suffixes at 4 and 7 digits), or the Firestore fallback silently
 * stops matching things the in-memory search still finds.
 */
export function tokenForQuery(query: string): string {
  const digits = digitsOnly(query);
  // A query that's mostly/entirely digits is a phone snippet — match it the
  // way phoneTokens() indexed it (last-7, else last-4; index only goes that
  // granular, so anything shorter than 4 digits has no indexed token).
  if (digits.length >= Math.max(1, query.replace(/[\s()+-]/g, "").length) && digits.length >= 4) {
    return digits.length >= 7 ? digits.slice(-7) : digits.slice(-4);
  }
  return normalizeName(query).replace(/\s+/g, "").slice(0, MAX_PREFIX);
}

/** Client-side instant filter — matches a query against a slim customer row's name/phone. */
export function matchesQuery(row: { name: string; phone?: string }, query: string): boolean {
  const q = normalizeName(query);
  if (!q) return false;
  if (normalizeName(row.name).split(" ").some((w) => w.startsWith(q)) || normalizeName(row.name).includes(q)) {
    return true;
  }
  const digits = digitsOnly(query);
  if (digits.length >= 3 && digitsOnly(row.phone).includes(digits)) return true;
  return false;
}

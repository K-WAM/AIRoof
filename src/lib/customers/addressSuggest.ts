// Address suggestions for the job-create form: the addresses the business
// already has for the selected customer — its saved properties, its own
// address and the addresses of its past jobs. Pure and network-free so the
// route, the component and the tests all agree on order, de-duplication and
// filtering. No external address service is involved.
import { normalizeName } from "@/lib/format/name";
import type { CustomerProperty } from "@/types/customer";

export interface AddressSuggestion {
  address: string;
  city?: string;
  state?: string;
  /** The saved property's own name ("Northside Plaza"), when the suggestion came from one. */
  name?: string;
}

export interface AddressSuggestInput {
  /** The customer's saved service addresses, in stored order. At most CUSTOMER_PROPERTIES_MAX are used. */
  properties?: CustomerProperty[];
  /** The customer's own address (Customer.address). */
  customerAddress?: string;
  /** Past job addresses, most recent first. */
  jobAddresses?: string[];
  /** What the user has typed. Empty means "everything", so the list can open on focus. */
  query?: string;
}

export const ADDRESS_SUGGESTIONS_MAX = 8;

/** Lowercase, fold accents and turn every non-letter/number run into one space. */
function tokenize(value: string | undefined): string[] {
  return normalizeName(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function clean(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/**
 * A one-line address with no separate city (a job's or the customer's own: "101 Lakeview Drive, Coral Springs, FL
 * 33065") is the saved property {address: "101 Lakeview Drive", city: "Coral Springs"} when its words begin with the
 * property's street and then its city. Sample work (T-376) and fully typed job addresses are written this way.
 */
function oneLineIsProperty(line: AddressSuggestion, property: AddressSuggestion): boolean {
  if (line.city || !property.city) return false;
  const words = tokenize(line.address);
  const propertyWords = tokenize(`${property.address} ${property.city}`);
  return propertyWords.length <= words.length && propertyWords.every((word, i) => words[i] === word);
}

function sameAddress(a: AddressSuggestion, b: AddressSuggestion): boolean {
  if (oneLineIsProperty(a, b) || oneLineIsProperty(b, a)) return true;
  const addressKey = (s: AddressSuggestion) => tokenize(s.address).join(" ");
  if (addressKey(a) !== addressKey(b)) return false;
  const cityKey = (s: AddressSuggestion) => tokenize(s.city).join(" ");
  // A job/own address carries no city, so it can't contradict a saved property's city; two explicit
  // different cities mean two different properties on the same street.
  return cityKey(a) === "" || cityKey(b) === "" || cityKey(a) === cityKey(b);
}

function matches(suggestion: AddressSuggestion, queryTokens: string[]): boolean {
  if (queryTokens.length === 0) return true;
  const words = tokenize([suggestion.address, suggestion.city, suggestion.state, suggestion.name].filter(Boolean).join(" "));
  return queryTokens.every((q) => words.some((word) => word.startsWith(q)));
}

/**
 * Filter an already-built suggestion list by the typed text, capping at
 * ADDRESS_SUGGESTIONS_MAX. The component uses this for every keystroke, so
 * typing never costs a network round trip.
 */
export function filterAddressSuggestions(suggestions: AddressSuggestion[], query?: string): AddressSuggestion[] {
  const queryTokens = tokenize(query);
  // The field already holds one of the known addresses (the form filled in the customer's address, or the user
  // picked one earlier): that is not a search, so offer every address on file instead of only the one shown.
  const at = indexOfAddress(suggestions, query);
  if (at >= 0) {
    const shown = suggestions.slice(0, ADDRESS_SUGGESTIONS_MAX);
    if (at >= ADDRESS_SUGGESTIONS_MAX) shown[shown.length - 1] = suggestions[at];
    return shown;
  }
  return suggestions.filter((s) => matches(s, queryTokens)).slice(0, ADDRESS_SUGGESTIONS_MAX);
}

/** Where the field's current text sits in the list (same address, ignoring case/punctuation/accents), or -1. */
export function indexOfAddress(suggestions: AddressSuggestion[], value?: string): number {
  const key = tokenize(value).join(" ");
  return key ? suggestions.findIndex((s) => tokenize(s.address).join(" ") === key) : -1;
}

/**
 * De-duplicated suggestions in trust order — the most recent past job address
 * first, then the customer's own address, then its saved properties — filtered
 * by the typed text (any word order; punctuation and accents are ignored).
 * At most ADDRESS_SUGGESTIONS_MAX, so the list stays a glance, not a directory.
 */
export function suggestAddresses(input: AddressSuggestInput): AddressSuggestion[] {
  const candidates: AddressSuggestion[] = [];

  for (const address of input.jobAddresses ?? []) {
    const value = clean(address);
    if (value) candidates.push({ address: value });
  }

  const own = clean(input.customerAddress);
  if (own) candidates.push({ address: own });

  for (const property of input.properties ?? []) {
    const address = clean(property?.address);
    if (!address) continue;
    candidates.push({
      address,
      ...(clean(property.city) ? { city: clean(property.city) } : {}),
      ...(clean(property.state) ? { state: clean(property.state) } : {}),
      ...(clean(property.name) ? { name: clean(property.name) } : {}),
    });
  }

  const seen: AddressSuggestion[] = [];
  for (const candidate of candidates) {
    const at = seen.findIndex((s) => sameAddress(s, candidate));
    if (at < 0) { seen.push(candidate); continue; }
    // A recent job at a saved property keeps its place in the list but shows the property's name and city — and the
    // property's street, so a one-line job address doesn't print its city twice or fill the field differently.
    const kept = seen[at];
    const address = oneLineIsProperty(kept, candidate) ? candidate.address : kept.address;
    const city = kept.city ?? candidate.city, state = kept.state ?? candidate.state, name = kept.name ?? candidate.name;
    seen[at] = { address, ...(city ? { city } : {}), ...(state ? { state } : {}), ...(name ? { name } : {}) };
  }

  return filterAddressSuggestions(seen, input.query);
}

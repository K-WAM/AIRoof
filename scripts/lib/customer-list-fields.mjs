import { matchKey, normalizeName, digitsOnly } from "./jobba-import.mjs";

const STOPWORDS = new Set(["the", "inc", "llc", "corp", "co", "company", "and", "of", "a", "an", "&"]);
export function customerSearchTokens(customer) {
  const tokens = new Set();
  const words = (value) => {
    for (const word of normalizeName(value).split(" ").filter(w => w && !STOPWORDS.has(w))) {
      for (let n = Math.min(2, word.length); n <= Math.min(12, word.length); n++) if (tokens.size < 250) tokens.add(word.slice(0, n));
    }
  };
  const phone = (value) => { const digits = digitsOnly(value); if (digits.length >= 4 && tokens.size < 250) tokens.add(digits.slice(-4)); if (digits.length >= 7 && tokens.size < 250) tokens.add(digits.slice(-7)); };
  words(customer.name); phone(customer.phone);
  for (const contact of customer.contacts ?? []) { words(contact.name); phone(contact.phone); }
  words(customer.address);
  return [...tokens];
}

/** Only supplies absent fields. Existing zero/false/empty values are deliberate and preserved. */
export function missingCustomerListFields(customer, { businessId, customerId, now, history = [], jobCount = 0 }) {
  const dates = history.flatMap(r => [r.issuedAt, r.dueAt, r.createdAt]).filter(n => typeof n === "number" && Number.isFinite(n));
  const fallback = typeof customer.importedAt === "number" ? customer.importedAt : now;
  const defaults = { customerId, businessId, kind: "commercial", jobCount, lastJobAt: dates.length ? Math.max(...dates) : fallback, matchKey: matchKey(customer), searchTokens: customerSearchTokens(customer), active: true, createdAt: fallback, updatedAt: fallback };
  return Object.fromEntries(Object.entries(defaults).filter(([key]) => !Object.hasOwn(customer, key)));
}

export function historyForCustomer(customer, customerId, history) {
  const key = matchKey(customer);
  return history.filter(r => r.customerId === customerId || (!r.customerId && matchKey({ name: r.billTo ?? r.customerName }) === key));
}

import { normalizeName } from "@/lib/format/name";
import type { Vendor } from "@/types/vendor";

// Client-side helpers for Library -> Vendors (T-370). No network: the whole list is fetched once and filtered here.

/** Search box: name, type, city or contact, accent- and case-insensitive; every word must match somewhere. */
export function matchesVendor(vendor: Vendor, query: string): boolean {
  const words = normalizeName(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeName([vendor.name, vendor.type, vendor.city, vendor.contactName].filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}

/** "+19735551212" -> "(973) 555-1212"; anything else as written. */
export function displayPhone(phone: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : phone;
}

/** "Parsippany, NJ" / "NJ" / "Parsippany" / "". */
export function cityState(vendor: Pick<Vendor, "city" | "state">): string {
  return [vendor.city, vendor.state].filter(Boolean).join(", ");
}

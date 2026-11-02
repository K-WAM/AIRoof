import type { VerifiedUser } from "@/lib/auth/verifyRole";

// These responses serve office and field readers. Redact ONLY after the existing guard has identified the
// credential used: an office login which happens to carry a field cookie still gets its office response.
const FINANCIAL_FIELDS = new Set([
  "price", "prices", "pricing", "rate", "rates", "cost", "costs", "amount", "amounts", "total", "totals",
  "subtotal", "balance", "discount", "tax", "fees", "invoice", "quote", "invoicesuggestions", "pricemode",
  "balancedue", "amountpaid", "amountdue", "totaldue", "totalpaid", "payments",
]);
const QUANTITY_TOTALS = new Set(["currenttotal", "newtotal", "totallaborhours"]);

function stripPrices(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPrices);
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => {
    const name = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (QUANTITY_TOTALS.has(name)) return true; // correction quantities/hours are operational data, not money
    return !FINANCIAL_FIELDS.has(name) && !/(price|cost|rate|amount|total|subtotal|balance|discount|tax|fee)s?$/.test(name);
  }).map(([key, child]) => [key, stripPrices(child)]));
}

/** Serialization boundary only: no storage mutation and no change to authorization or office payloads. */
export function fieldResponse(value: unknown, user: Pick<VerifiedUser, "uid" | "role">): unknown {
  return user.role === "crew" || user.uid.startsWith("field:") ? stripPrices(value) : value;
}

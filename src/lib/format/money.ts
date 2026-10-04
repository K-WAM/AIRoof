// Shared currency formatting — replaces the ad hoc `fmt()` helpers duplicated
// in invoice/report send routes.

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$1,234.56" */
export function fmtMoney(n: number | undefined | null): string {
  return usd.format(Number.isFinite(n) ? (n as number) : 0);
}

/**
 * Round dollars to cents the way a calculator does. `Math.round(x * 100) / 100` is wrong on half-cents because of
 * binary floating point: 99.99 × 1.5 = 149.985 is stored as 149.98499999…, which rounds DOWN to 149.98. Fixing the
 * product to 6 decimals first removes that noise, so 149.985 → 149.99. Every money total rounds through here.
 */
export function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Number((value * 100).toFixed(6))) / 100;
}

// Shared currency formatting — replaces the ad hoc `fmt()` helpers duplicated
// in invoice/report send routes.

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$1,234.56" */
export function fmtMoney(n: number | undefined | null): string {
  return usd.format(Number.isFinite(n) ? (n as number) : 0);
}

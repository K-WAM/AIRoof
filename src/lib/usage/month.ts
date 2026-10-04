/** "2026-10" for a timestamp (UTC). Shared by the usage meter (server) and the Usage page (browser). */
export function monthKey(ms = Date.now()): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

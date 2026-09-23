// Single source of truth for the app's own absolute base URL (booking-confirmation
// emails, team-invite links, demo/QR links). Falls back to the current production
// domain so behavior is unchanged until NEXT_PUBLIC_APP_URL is set per-environment in
// Vercel (T-095) — that's also what makes the eventual crm.luxordev.com move a config
// change instead of a code change.
//
// Must reference `process.env.NEXT_PUBLIC_APP_URL` as a static property access (not
// through a dynamic helper) so Next.js inlines it into client bundles too — this file
// is imported from both server routes and client components.
const DEFAULT_APP_URL = "https://ai-roof.vercel.app";

export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  return (configured && configured.length > 0 ? configured : DEFAULT_APP_URL).replace(/\/+$/, "");
}

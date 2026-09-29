import type { AccountPurpose } from "@/types";

// Phase 32 (T-166, contract C-A). Why a tenant exists, as the server decides it — never guessed from its name.
// Demo tenants are derived (the Demo Studio allowlist or the isDemo marker), so a stored value can't turn the shared
// demo line into a "client" or a client into a demo. Keep DEMO_BUSINESS_IDS in step with the allowlist in
// src/app/api/admin/demo-customize/route.ts (that file is under the Booking-change gate, so it keeps its own copy).
export const DEMO_BUSINESS_IDS: ReadonlySet<string> = new Set(["demo-roofing"]);

export type EffectiveAccountPurpose = AccountPurpose | "unclassified";

export function isDemoTenant(businessId: string, data: { isDemo?: unknown } | undefined | null): boolean {
  return DEMO_BUSINESS_IDS.has(businessId) || data?.isDemo === true;
}

export function effectiveAccountPurpose(
  businessId: string,
  data: { accountPurpose?: unknown; isDemo?: unknown } | undefined | null,
): EffectiveAccountPurpose {
  if (isDemoTenant(businessId, data)) return "demo";
  const stored = data?.accountPurpose;
  return stored === "client" || stored === "test" || stored === "archived" ? stored : "unclassified";
}

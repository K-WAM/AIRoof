import type { VerticalId, CalendarMode, VisualFamily } from "@/lib/verticals/templates";
import type { CompanyModule } from "@/hooks/useBusinessModules";

/**
 * One call, one document read, everything a company page needs about "this
 * business" to render its shell — replaces two separate client-Firestore
 * reads (useBusinessModules + useBusinessTimezone) of the exact same
 * `businesses/{businessId}` doc. `vocab` deliberately stays off the wire:
 * it's derived client-side from `industry` via getVerticalTemplate, so the
 * payload stays a few hundred bytes instead of re-sending strings that are
 * already in the client bundle.
 */
export interface CompanyBootstrap {
  business: {
    businessId: string;
    businessName: string;
    industry: VerticalId | null;
    timezone: string;
    subscriptionStatus: "active" | "paused" | "trial" | null;
    brandColor: string | null;
    logoUrl: string | null;
    /** The AI phone line (E.164) — what empty states' "Call your line" dials. */
    phoneLine: string | null;
    /** Phase 31 (T-152): effective texting state — env SMS_ENABLED + Twilio creds + the tenant's own smsEnabled. */
    smsEnabled: boolean;
  };
  modules: {
    disabled: CompanyModule[];
    calendarMode: CalendarMode;
    family: VisualFamily | null;
  };
  serverNow: number;
}

"use client";

import { useEffect, useState } from "react";
import { getFirebaseDb } from "@/lib/firebase/client";
import { useBusinessId } from "@/hooks/useBusinessId";
import {
  VERTICAL_TEMPLATES,
  getVerticalTemplate,
  type VerticalId,
  type VerticalVocab,
  type CalendarMode,
  type VisualFamily,
} from "@/lib/verticals/templates";

export type CompanyModule = "jobs" | "pricing" | "library";

export interface BusinessModules {
  industry: VerticalId | null;
  vocab: VerticalVocab;
  /** What the Calendar board schedules for this industry. */
  calendarMode: CalendarMode;
  /** Company-portal accent family (T-056) — null until resolved, fails open to the default teal. */
  family: VisualFamily | null;
  disabledModules: CompanyModule[];
  /** Dashboard-access gate (superadmin-set, non-payment pause). Never affects
   * the phone agent — see the paused screen in src/app/company/layout.tsx. */
  subscriptionStatus: "active" | "paused" | "trial" | null;
  /** True once the business doc has resolved — gate rendering on this to avoid a tab flashing in and out. */
  ready: boolean;
  isEnabled: (module: CompanyModule) => boolean;
}

const DEFAULT_VOCAB = VERTICAL_TEMPLATES.roofing.vocab;

interface CachedBusinessDoc {
  industry: string | null;
  subscriptionStatus: "active" | "paused" | "trial" | null;
}

/**
 * Which company modules this tenant's industry uses, plus its wording.
 * A dental office has no field jobs, so it must never see Jobs/Field/Library —
 * not in the nav, not on the dashboard, not in the Guide.
 *
 * Cached in sessionStorage per business (same pattern as useBusinessTimezone) so
 * every consumer on a page shares one read.
 */
export function useBusinessModules(): BusinessModules {
  const businessId = useBusinessId();
  const [industry, setIndustry] = useState<VerticalId | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<"active" | "paused" | "trial" | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;

    const cacheKey = `businessModules_${businessId}`;
    const applyCached = (cached: CachedBusinessDoc): boolean => {
      if (typeof cached.industry === "string" && cached.industry in VERTICAL_TEMPLATES) {
        setIndustry(cached.industry as VerticalId);
      }
      setSubscriptionStatus(cached.subscriptionStatus ?? null);
      setReady(true);
      return true;
    };

    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        applyCached(JSON.parse(cached) as CachedBusinessDoc);
        return;
      }
    } catch {
      /* sessionStorage unavailable (SSR), or a legacy bare-string cache from before this field existed */
    }

    (async () => {
      const db = await getFirebaseDb();
      if (!db) {
        if (!cancelled) setReady(true);
        return;
      }
      const { doc, getDoc } = await import("firebase/firestore");
      getDoc(doc(db, "businesses", businessId))
        .then((snap) => {
          if (cancelled) return;
          const data = snap.data();
          const industryValue = data?.industry;
          const statusValue = data?.subscriptionStatus;
          const resolved: CachedBusinessDoc = {
            industry: typeof industryValue === "string" && industryValue in VERTICAL_TEMPLATES ? industryValue : null,
            subscriptionStatus:
              statusValue === "paused" || statusValue === "trial" || statusValue === "active" ? statusValue : null,
          };
          if (resolved.industry) setIndustry(resolved.industry as VerticalId);
          setSubscriptionStatus(resolved.subscriptionStatus);
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(resolved));
          } catch {
            /* ignore */
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setReady(true);
        });
    })();

    return () => {
      cancelled = true;
    };
  }, [businessId]);

  // Unknown industry keeps every module — never hide a tab we aren't sure about.
  const template = industry ? getVerticalTemplate(industry) : null;
  const disabledModules = (template?.disabledModules ?? []) as CompanyModule[];

  return {
    industry,
    subscriptionStatus,
    vocab: template?.vocab ?? DEFAULT_VOCAB,
    calendarMode: template?.calendarMode ?? "jobs",
    family: template?.family ?? null,
    disabledModules,
    ready,
    isEnabled: (module) => !disabledModules.includes(module),
  };
}

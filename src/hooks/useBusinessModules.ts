"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useBusinessId } from "@/hooks/useBusinessId";
import {
  VERTICAL_TEMPLATES,
  getVerticalTemplate,
  type VerticalId,
  type VerticalVocab,
  type CalendarMode,
} from "@/lib/verticals/templates";

export type CompanyModule = "jobs" | "pricing" | "library";

export interface BusinessModules {
  industry: VerticalId | null;
  vocab: VerticalVocab;
  /** What the Calendar board schedules for this industry. */
  calendarMode: CalendarMode;
  disabledModules: CompanyModule[];
  /** True once the business doc has resolved — gate rendering on this to avoid a tab flashing in and out. */
  ready: boolean;
  isEnabled: (module: CompanyModule) => boolean;
}

const DEFAULT_VOCAB = VERTICAL_TEMPLATES.roofing.vocab;

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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!db || !businessId) return;
    let cancelled = false;

    const cacheKey = `industry_${businessId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setIndustry(cached as VerticalId);
        setReady(true);
        return;
      }
    } catch {
      /* sessionStorage unavailable (SSR) */
    }

    getDoc(doc(db, "businesses", businessId))
      .then((snap) => {
        if (cancelled) return;
        const value = snap.data()?.industry;
        if (typeof value === "string" && value in VERTICAL_TEMPLATES) {
          setIndustry(value as VerticalId);
          try {
            sessionStorage.setItem(cacheKey, value);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId]);

  // Unknown industry keeps every module — never hide a tab we aren't sure about.
  const template = industry ? getVerticalTemplate(industry) : null;
  const disabledModules = (template?.disabledModules ?? []) as CompanyModule[];

  return {
    industry,
    vocab: template?.vocab ?? DEFAULT_VOCAB,
    calendarMode: template?.calendarMode ?? "jobs",
    disabledModules,
    ready,
    isEnabled: (module) => !disabledModules.includes(module),
  };
}

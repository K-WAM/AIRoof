"use client";

import { useBootstrap } from "@/contexts/BootstrapContext";
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

/**
 * Which company modules this tenant's industry uses, plus its wording.
 * A dental office has no field jobs, so it must never see Jobs/Field/Library —
 * not in the nav, not on the dashboard, not in the Guide.
 *
 * A thin selector over BootstrapContext (single fetch, single sessionStorage
 * cache shared with useBusinessTimezone) — kept as its own hook so none of
 * its ~15 call sites across the app need to change.
 */
export function useBusinessModules(): BusinessModules {
  const { data, ready } = useBootstrap();
  const industry = data?.business.industry ?? null;
  // Unknown industry keeps every module — never hide a tab we aren't sure about.
  const template = industry ? getVerticalTemplate(industry) : null;
  const disabledModules = (data?.modules.disabled ?? template?.disabledModules ?? []) as CompanyModule[];

  return {
    industry,
    subscriptionStatus: data?.business.subscriptionStatus ?? null,
    vocab: template?.vocab ?? DEFAULT_VOCAB,
    calendarMode: data?.modules.calendarMode ?? template?.calendarMode ?? "jobs",
    family: data?.modules.family ?? template?.family ?? null,
    disabledModules,
    ready,
    isEnabled: (module) => !disabledModules.includes(module),
  };
}

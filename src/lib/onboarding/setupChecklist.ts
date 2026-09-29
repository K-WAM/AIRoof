import type { BusinessModules } from "@/hooks/useBusinessModules";
import type { VerticalVocab } from "@/lib/verticals/templates";
import { validateBusinessHours } from "@/lib/scheduling/hours";

export type SetupItemId = "phone" | "hours" | "prices" | "resource" | "logo" | "team" | "testCall";

export interface SetupItem {
  id: SetupItemId;
  label: string;
  done: boolean;
  /** Where the fix lives. Absent = nothing the client can do (Luxor connects the line). */
  href?: string;
  cta?: string;
  outcome: string;
}

/** Raw counts from GET /api/company/setup-status. Counts, not booleans, so "done" is decided here, in one place. */
export interface SetupChecklistInput {
  phoneConfigured: boolean;
  businessHours?: unknown;
  prices: number;
  resources: number;
  hasLogo: boolean;
  teamMembers: number;
  calls: number;
  /** The AI line in E.164, for the tel: link. */
  phoneNumber?: string | null;
}

/**
 * The Dashboard's "Get your business ready" list (docs/NO-TRAINING-UX-PLAN.md §3.1). Pure and
 * industry-aware: an item whose module this vertical doesn't have is skipped, never shown greyed out.
 */
export function setupChecklist(
  input: SetupChecklistInput,
  modules: Pick<BusinessModules, "isEnabled">,
  vocab: Pick<VerticalVocab, "resourceNoun">,
): SetupItem[] {
  const resource = vocab.resourceNoun.toLowerCase();
  const items: SetupItem[] = [
    input.phoneConfigured
      ? { id: "phone", label: "Check your phone line", done: true, outcome: "Your AI receptionist is configured to answer calls.", href: "/company/settings#phone", cta: "View line" }
      : { id: "phone", label: "Check your phone line", done: false, outcome: "Luxor connects the line before callers can reach your receptionist.", href: "/company/settings#phone", cta: "View line" },
    {
      id: "hours",
      label: "Set your hours",
      outcome: "Bookings follow your business hours and timezone.",
      done: validateBusinessHours(input.businessHours).valid,
      href: "/company/settings#hours",
      cta: "Set hours",
    },
  ];
  if (modules.isEnabled("pricing")) {
    items.push({ id: "prices", label: "Add your prices", outcome: "Quotes can use your standard services and rates.", done: input.prices > 0, href: "/company/library?section=pricing", cta: "Add prices" });
  }
  if (modules.isEnabled("library")) items.push(
    { id: "resource", label: `Add your first ${resource}`, outcome: `Your ${resource} can receive work on the calendar.`, done: input.resources > 0, href: "/company/library?section=crews", cta: `Add ${resource}` },
  );
  items.push(
    { id: "team", label: "Invite your team", outcome: "Teammates can see the work assigned to them.", done: input.teamMembers >= 2, href: "/company/team", cta: "Invite someone" },
    { id: "logo", label: "Upload your logo", outcome: "Your documents can carry your brand.", done: input.hasLogo, href: "/company/library?section=branding", cta: "Upload logo" },
    {
      id: "testCall",
      label: "Make a test call",
      outcome: "Hear the receptionist and check that the call appears in Calls.",
      done: input.calls > 0,
      ...(input.phoneNumber ? { href: `tel:${input.phoneNumber}`, cta: "Call your line" } : {}),
    },
  );
  return items;
}

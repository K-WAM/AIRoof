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
      ? { id: "phone", label: "Your phone line is connected", done: true }
      : { id: "phone", label: "Luxor is connecting your line", done: false },
    {
      id: "hours",
      label: "Set your hours",
      done: validateBusinessHours(input.businessHours).valid,
      href: "/company/settings",
      cta: "Set hours",
    },
  ];
  if (modules.isEnabled("pricing")) {
    items.push({ id: "prices", label: "Add your prices", done: input.prices > 0, href: "/company/library?section=pricing", cta: "Add prices" });
  }
  items.push(
    { id: "resource", label: `Add your first ${resource}`, done: input.resources > 0, href: "/company/library?section=crews", cta: `Add ${resource}` },
    { id: "logo", label: "Upload your logo", done: input.hasLogo, href: "/company/library?section=branding", cta: "Upload logo" },
    { id: "team", label: "Invite your team", done: input.teamMembers >= 2, href: "/company/team", cta: "Invite someone" },
    {
      id: "testCall",
      label: "Make a test call",
      done: input.calls > 0,
      ...(input.phoneNumber ? { href: `tel:${input.phoneNumber}`, cta: "Call your line" } : {}),
    },
  );
  return items;
}

import type { OnboardingFormDefinition } from "@/types/onboarding";
export function formDefinition(def: OnboardingFormDefinition, fee?: number): OnboardingFormDefinition {
  const replacement = fee === undefined ? "confirmed with you before anything starts" : `$${fee.toLocaleString("en-US")} per company`;
  return { ...def, info: def.info?.map(b => ({ ...b, text: b.text?.replaceAll("{{setupFee}}", replacement), items: b.items?.map(t => t.replaceAll("{{setupFee}}", replacement)) })) };
}

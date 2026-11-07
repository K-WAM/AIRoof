import type { OnboardingAnswers, OnboardingFormDefinition } from "@/types/onboarding";

export function maskEin(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 9 ? `••-•••${digits.slice(-4)}` : "";
}
export function keepSavedEin(value: unknown, saved: unknown): unknown {
  return typeof saved === "string" && value === maskEin(saved) && maskEin(saved) ? saved : value;
}
export function maskAnswers(definition: OnboardingFormDefinition, answers: OnboardingAnswers): OnboardingAnswers {
  const result = { ...answers };
  for (const field of definition.sections.flatMap(s => s.fields)) if (field.type === "ein" && field.id in result) result[field.id] = maskEin(result[field.id]);
  return result;
}

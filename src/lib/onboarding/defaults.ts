import { ONBOARDING_FORM_IDS, type OnboardingPortal, type OnboardingFormId } from "@/types/onboarding";

export function portalDefaults(businessId: string, clientName: string, now = Date.now()): OnboardingPortal {
  const steps = [
    ["request", "Information request sent", "We send a short list of what we need to get started."],
    ["information", "Information received", "We check the details and examples you share."],
    ["forms-sent", "Setup forms sent", "Your setup forms are ready for your team."],
    ["forms-returned", "Setup forms returned", "We review your answers and prepare your account."],
    ["review", "Review call", "We walk through the account together and confirm any decisions."],
    ["live", "Go live", "You approve the setup before your team starts using it."],
  ];
  const groups: Array<[string, Array<[string, OnboardingFormId | "email" | undefined]>]> = [
    ["Documents", [["Document templates and completed examples", "email"], ["How each document is used", "documents"]]],
    ["Workflow", [["Workflow outline", "documents"], ["Access to your current system, or a walkthrough", undefined]]],
    ["Customers and history", [["Customer and property list", "email"], ["Customer phone numbers and emails", "email"], ["Materials and price list", "email"], ["Job history export", "email"], ["Three to five sample jobs with notes, photos and invoices", "email"]]],
    ["Team", [["Staff list", "team"], ["Who can do what", "team"]]],
    ["Company", [["Logos and brand assets", "email"], ["Company and booking details", "company"]]],
    ["Payments", [["How you get paid today", "payments"], ["Online payments setup", "payments"]]],
    ["Text messages", [["Texting registration", "texting"]]],
  ];
  return {
    businessId, clientName, createdAt: now, updatedAt: now,
    steps: steps.map(([id, title, detail], i) => ({ id, title, detail, status: i === 0 ? "current" : "upcoming" })),
    checklist: groups.flatMap(([group, items], g) => items.map(([title, route], i) => ({
      id: `item-${g}-${i}`, group, title, status: "waiting" as const,
      ...(route === "email" ? { sendByEmail: true } : route ? { formId: route } : {}),
    }))),
    forms: Object.fromEntries(ONBOARDING_FORM_IDS.map(id => [id, { id, enabled: true, status: "not_sent" }])) as OnboardingPortal["forms"],
    settings: { contactName: "Luxor", contactEmail: "connect@luxordev.com" },
  };
}

import type { OnboardingPortal, PublicOnboardingView } from "@/types/onboarding";
import { ONBOARDING_FORMS } from "./forms";

export function publicView(portal: OnboardingPortal, logoUrl: string | null = null): PublicOnboardingView {
  return {
    clientName: portal.clientName, logoUrl,
    steps: portal.steps.map(({ id, title, detail, date, timeLabel, status, completedAt }) => ({ id, title, detail, date, timeLabel, status, completedAt })),
    checklist: portal.checklist.map(({ id, group, title, detail, status, formId, sendByEmail, receivedAt }) => ({ id, group, title, detail, status, formId: formId && portal.forms[formId].enabled ? formId : undefined, sendByEmail, receivedAt })),
    forms: Object.values(portal.forms).filter(f => f.enabled).map(({ id, status }) => {
      const { title, summary, minutes } = ONBOARDING_FORMS[id];
      return { id, status, title, summary, minutes };
    }),
    ...(portal.dataReview ? { dataReview: portal.dataReview } : {}),
    settings: { contactName: portal.settings.contactName, contactEmail: portal.settings.contactEmail, nextMeetingLabel: portal.settings.nextMeetingLabel },
    expiresAt: portal.link?.expiresAt ?? 0,
  };
}

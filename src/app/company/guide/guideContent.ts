import type { CompanyModule } from "@/hooks/useBusinessModules";
import type { CalendarMode, VerticalVocab } from "@/lib/verticals/templates";

// The words on the Guide. Every button or tab named here is a real label in the app (checked 2026-10-30) — when a
// screen's label changes, change it here too. Industry words come from the vertical's vocab, and a step for a product
// this client does not have is left out (a dental office never reads about crews or field notes).

export type GuideRole = "owner" | "admin" | "staff" | "foreman";
export const GUIDE_ROLES: GuideRole[] = ["owner", "admin", "staff", "foreman"];

export const GUIDE_QUICK_ANSWERS = [{
  question: "Can I answer calls myself?",
  answer: "Yes. Keep your own number and forward it to your AI line only when you don't pick up. Your phone rings first; after about 4 rings, the call goes to the AI. You can also forward all calls after hours. Ask Luxor to set it up. The AI never takes a call you answered.",
}];

export interface GuideStep {
  action: string;
  detail: string;
  /** The screen the step happens on ("Open" button). */
  path?: string;
}

export interface Guide {
  title: string;
  steps: GuideStep[];
  tips: string[];
}

interface GuideContext {
  isEnabled: (module: CompanyModule) => boolean;
  vocab: VerticalVocab;
  calendarMode: CalendarMode;
  /** False for set-price industries: their jobs have no Findings or Quote. */
  quotes: boolean;
}

const lower = (word: string) => word.toLowerCase();

export function guideFor(role: GuideRole, { isEnabled, vocab, calendarMode, quotes }: GuideContext): Guide {
  const job = lower(vocab.jobNoun);
  const jobs = lower(vocab.jobNounPlural);
  const crew = lower(vocab.resourceNoun);
  const customer = lower(vocab.customerNoun);
  const calls = isEnabled("calls");
  const hasJobs = isEnabled("jobs");
  const only = <T,>(on: boolean, item: T): T[] => (on ? [item] : []);

  switch (role) {
    case "owner":
      return {
        title: "See the business at a glance, and get paid",
        steps: [
          { action: "Dashboard", detail: "Start here each morning: new calls, bookings waiting for the office, and anything that needs you.", path: "/company/dashboard" },
          ...only(calls, { action: "Calls", detail: "Every call the phone AI answered, with a short summary. Play it or read it.", path: "/company/calls" }),
          ...only(calls, { action: "Pipeline", detail: `New bookings land here. Confirm sends the ${customer} their confirmation; Decline lets them know politely.`, path: "/company/pipeline" }),
          ...only(isEnabled("billing"), { action: "Billing", detail: "Who has paid and who is late. Payment reminders go out on their own.", path: "/company/billing" }),
          { action: "Settings", detail: "Your hours, contact details and how you get paid.", path: "/company/settings" },
        ],
        tips: [
          ...only(calls, "The phone AI answers day and night, in English or Spanish, and only books inside your hours."),
          ...only(calls, "Nothing is promised to a customer until someone in your office confirms it."),
          "Every page works on a phone. Open Menu to move around.",
        ],
      };
    case "admin":
      return {
        title: "Set it up once, keep it current",
        steps: [
          { action: "Team", detail: "Invite each person and pick their type: Admin, Office staff, Inspector, Technician or View only.", path: "/company/team" },
          ...only(hasJobs, { action: `Library → ${vocab.resourceNounPlural}`, detail: `Add each ${crew} and who is on it. ${vocab.resourceNounPlural} are the rows on the Calendar.`, path: "/company/library?section=crews" }),
          ...only(isEnabled("pricing"), { action: "Library → Prices & rates", detail: "Your prices fill in quotes and invoices, so nobody types them twice.", path: "/company/library?section=pricing" }),
          { action: "Library → Logo", detail: "Upload your logo once. It goes on every quote, report, invoice and email.", path: "/company/library?section=branding" },
          { action: "Settings", detail: "Business hours (the phone AI books only inside them), contact details and Getting paid.", path: "/company/settings" },
        ],
        tips: [
          "Only Admins see Team and can change who has access.",
          ...only(hasJobs, `A ${crew} member's type decides what they see: a Technician gets the Field screen only, no prices.`),
          "Changes save right away. The next phone call already uses new hours.",
        ],
      };
    case "staff":
      return {
        title: hasJobs ? `Turn calls into scheduled ${jobs}` : "Turn calls into confirmed bookings",
        steps: [
          ...only(calls, { action: "Pipeline", detail: `Open each new request and read what the caller needs. Confirm (it emails the ${customer}) or Decline.`, path: "/company/pipeline" }),
          ...only(hasJobs, { action: `Create ${vocab.jobNoun}`, detail: `One tap from the request. The ${customer}'s name, phone and address come with it.` }),
          {
            action: "Calendar",
            detail: calendarMode === "jobs"
              ? `Drag the ${job} onto a ${crew} and a day, pick the time, then Confirm + email crew.`
              : `Drag the booking onto a ${crew} and a day, then confirm it.`,
            path: "/company/calendar",
          },
          ...only(hasJobs, { action: `The ${job} page`, detail: `${quotes ? "Findings, Quote, Report and Invoice" : "Report and Invoice"} live on one page. Check each one, then Send.`, path: "/company/jobs" }),
          ...only(isEnabled("library"), { action: vocab.customerNounPlural, detail: `Type any name, phone or address to find a ${customer} and all their ${jobs}.`, path: "/company/customers" }),
        ],
        tips: [
          ...only(hasJobs, `Send to a worker (on a ${job} page) emails or texts the field link for that ${job}. No account needed.`),
          ...only(calls, "Call Back on a request rings the number the caller asked to be reached on."),
          "Search at the top finds any call, request, job or customer by name, phone or number.",
        ],
      };
    case "foreman":
      return {
        title: "Talk, don't type",
        steps: [
          { action: "Field", detail: `Open Field and pick today's ${job}, or open the link the office sent you.`, path: "/company/field" },
          { action: "Clock in", detail: `Tap Clock in when you reach the ${job}. Lunch and leaving are one tap each.` },
          { action: "Hold to talk, or tap to start", detail: `Say what you did and used, for example: "${vocab.voiceExample}". Spanish is fine.` },
          { action: "+ Photo", detail: "Add before and after photos with a short description." },
          { action: "Clock out for the day", detail: "The office sees every note and photo right away, on the job." },
        ],
        tips: [
          `Said a wrong number? Say "make that 15, not 12" and confirm the change.`,
          "No signal or somewhere noisy? Type the note instead.",
          `Check the ${job} name at the top before you talk — it says which ${job} the note goes to.`,
        ],
      };
  }
}

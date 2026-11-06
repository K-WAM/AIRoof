import type { CompanyModule } from "@/hooks/useBusinessModules";
import type { CalendarMode, VerticalVocab } from "@/lib/verticals/templates";
import type { TeamRole } from "@/types/team";
import { visibleNavLinks } from "../navModel";

// The words on the Guide. Every button or tab named here is a real label in the app (checked 2026-10-30, the role
// manuals 2026-11-05) — when a screen's label changes, change it here too. Industry words come from the vertical's
// vocab, and a step for a product this client does not have is left out (a dental office never reads about crews or
// field notes).

export type GuideRole = "owner" | "admin" | "staff" | "supervisor" | "inspector" | "foreman" | "viewer";
export const GUIDE_ROLES: GuideRole[] = ["owner", "admin", "staff", "supervisor", "inspector", "foreman", "viewer"];
/** Guides about job and field work: shown only where the industry has jobs. */
export const JOBS_GUIDE_ROLES: GuideRole[] = ["supervisor", "inspector", "foreman"];
/** The only guides a field (Crew) login sees — it cannot open the office screens the others describe. */
export const FIELD_GUIDE_ROLES: GuideRole[] = ["inspector", "foreman"];
/** The permission role each guide describes. "Your screens" comes from visibleNavLinks() — the same list that builds
 *  that person's menu — so a manual can never list a screen they cannot open. */
export const GUIDE_TEAM_ROLE: Record<GuideRole, TeamRole> = {
  owner: "owner", admin: "owner", staff: "staff", supervisor: "staff", inspector: "crew", foreman: "crew", viewer: "viewer",
};

export const GUIDE_QUICK_ANSWERS = [{
  question: "Can I answer calls myself?",
  answer: "Yes. Keep your own number and forward it to your AI line only when you don't pick up. Your phone rings first; after about 4 rings, the call goes to the AI. You can also forward all calls after hours. Ask Luxor to set it up. The AI never takes a call you answered.",
}, {
  question: "What if there is no signal at the job site?",
  answer: "Keep working. Notes, voice recordings, photos and clock-ins are saved on your phone and show \"Saved on this phone — will send when you have signal\". They send by themselves when signal comes back and then show \"Sent ✓\". Don't clear the browser or sign out until they say Sent.",
}, {
  question: "How do I move or reschedule a job?",
  answer: "Open Calendar and tap the job or booking. Choose a new day, time and crew, then tap Reschedule — or Unschedule to take it off the calendar. You choose whether the crew gets an email. Made a mistake? Tap Undo right after.",
}, {
  question: "Where is search?",
  answer: "At the top of every screen. Type a name, phone number or job number to find any call, request, job or customer. On a computer, press / to jump to it.",
}, {
  question: "Can I see the calendar without internet?",
  answer: "Yes — the last version you opened stays on screen with a note saying when it was saved. Changes wait until you are back online.",
}];

export interface GuideStep {
  action: string;
  detail: string;
  /** The screen the step happens on ("Open" button). */
  path?: string;
}

/** A "How to…" card: one task, at most four short steps. */
export interface GuideTask {
  title: string;
  steps: string[];
  path?: string;
}

export interface Guide {
  title: string;
  steps: GuideStep[];
  tips: string[];
  howTo: GuideTask[];
}

/** One screen in "Your screens": what it shows and what you do there, two to four bullets. */
export interface GuideScreen {
  path: string;
  name: string;
  bullets: string[];
}

interface GuideContext {
  isEnabled: (module: CompanyModule) => boolean;
  vocab: VerticalVocab;
  calendarMode: CalendarMode;
  /** False for set-price industries: their jobs have no Findings or Quote. */
  quotes: boolean;
  /** This business's preview pages (bootstrap `showcase`), so Finances/Payroll are listed only where they exist. */
  showcase?: { finances?: boolean; payroll?: boolean };
  /** The business bills under two or more companies (bootstrap `companies`). */
  multiCompany?: boolean;
}

const FIX_A_NUMBER: GuideTask = {
  title: "Fix a wrong number",
  steps: [`Say the correction, for example "make that 15, not 12".`, "Read the change card.", "Tap Yes, change it, or Keep as is."],
};
const NO_SIGNAL: GuideTask = {
  title: "Work without signal",
  steps: [
    "Keep working. Notes, photos and clock-ins show Saved on this phone.",
    "They send by themselves when signal comes back, then show Sent ✓.",
    "Don't sign out or clear the browser until they do.",
  ],
};

const lower = (word: string) => word.toLowerCase();

export function guideFor(role: GuideRole, { isEnabled, vocab, calendarMode, quotes, multiCompany = false }: GuideContext): Guide {
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
        howTo: [
          ...only(isEnabled("billing") && hasJobs, {
            title: "Record a payment",
            path: "/company/billing",
            steps: ["Open Billing and tap the invoice.", "Tap Record payment.", "Enter Amount received ($), Paid by and Date received.", "Tap Save payment. The balance updates by itself."],
          }),
          ...(multiCompany && hasJobs
            ? [{
              title: "Send an invoice from the right company",
              path: "/company/jobs",
              steps: [`Open the ${job} and its Invoice tab.`, "Check Sent as at the top. Tap Change to switch company.", "Check the letterhead, the amounts and who it goes to.", "Tap Send Invoice."],
            }]
            : only(calls, {
              title: "Check what a caller said",
              path: "/company/calls",
              steps: ["Open Calls and tap the call.", "Read the summary. Play the recording if you need to.", "Then open the linked request to see what happens next."],
            })),
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
        howTo: [
          {
            title: "Invite a person",
            path: "/company/team",
            steps: ["Open Team and tap Invite person.", "Enter their name and email, and pick their type.", "Tap Send invite. They set their own password from the email."],
          },
          {
            title: "Change your hours",
            path: "/company/settings",
            steps: ["Open Settings → Hours & timezone.", "Set Open and Close for each day. Tick Closed for days off.", "Tap Save Changes and wait for the saved message."],
          },
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
        howTo: [
          ...only(calls, {
            title: "Confirm a new request",
            path: "/company/pipeline",
            steps: [
              "Open Pipeline and tap the request.",
              `Check the address, time, service and how to reach the ${customer}.`,
              "Tap Confirm & email. Something missing? Tap Call Back first.",
              ...only(hasJobs, `Tap Create ${vocab.jobNoun} to start the ${job}.`),
            ],
          }),
          hasJobs
            ? {
              title: "Send an invoice",
              path: "/company/jobs",
              steps: [`Open the ${job} and its Invoice tab.`, "Tap Create invoice. Check every amount and who it goes to.", "Tap Send Invoice.", "When money arrives, tap Record payment."],
            }
            : {
              title: "Move a booking",
              path: "/company/calendar",
              steps: ["Open Calendar and tap the booking.", "Pick the new day and time, then tap Reschedule.", "Moved the wrong one? Tap Undo right away."],
            },
        ],
      };
    case "supervisor":
      return {
        title: `Keep every ${crew} on track`,
        steps: [
          { action: "Calendar", detail: `Check today and tomorrow: every ${job} on a ${crew}, with a time.`, path: "/company/calendar" },
          { action: vocab.jobNounPlural, detail: `Open each active ${job} and read the new field notes and photos.`, path: "/company/jobs" },
          { action: "Check the numbers", detail: `Materials and labor should match what happened on site. Fix a wrong number on the ${job} page.` },
          ...only(quotes, { action: "Findings", detail: "Check the problem and the work needed before the office sends a quote." }),
          { action: "Send to a worker", detail: `Send the field link for a ${job} to whoever is on site.` },
        ],
        tips: [
          `Field logins can't mark a ${job} done. You or the office do it on the ${job} page.`,
          `Search at the top finds any ${job}, ${customer} or call.`,
        ],
        howTo: [
          {
            title: `Move a ${job} to another day`,
            path: "/company/calendar",
            steps: [`Open Calendar and tap the ${job}.`, `Pick the new day, time and ${crew}, then tap Reschedule.`, "Leave Email the crew the new schedule ticked, unless you will tell them yourself."],
          },
          {
            title: "Send a worker the field link",
            path: "/company/jobs",
            steps: [`Open the ${job} and tap Send to a worker.`, "Type their phone or email, then send it.", "Standing next to them? They can point their camera at the code instead."],
          },
        ],
      };
    case "inspector":
      return {
        title: "Inspect, photograph, write it up",
        steps: [
          { action: "My schedule", detail: "Open Field. My schedule shows today's visits.", path: "/company/field" },
          { action: "Clock in", detail: "Tap Clock in when you arrive." },
          { action: "+ Photo", detail: "Photograph each problem and add a short description." },
          { action: "Hold to talk, or tap to start", detail: "Say what you found and the work needed. Spanish is fine." },
          { action: "Clock out for the day", detail: "The office sees every note and photo right away." },
        ],
        tips: [
          `Check the ${job} name at the top before you talk. It is where the note goes.`,
          "Prices and invoices are not on your screen. The office handles them.",
        ],
        howTo: [FIX_A_NUMBER, NO_SIGNAL],
      };
    case "viewer":
      return {
        title: "See everything, change nothing",
        steps: [
          { action: "Dashboard", detail: "What is new today.", path: "/company/dashboard" },
          ...only(calls, { action: "Calls", detail: "Read or play any call.", path: "/company/calls" }),
          { action: "Calendar", detail: "Who is where, today and this week.", path: "/company/calendar" },
          ...only(hasJobs, { action: vocab.jobNounPlural, detail: `Open any ${job} to read its notes, photos and documents.`, path: "/company/jobs" }),
          ...only(isEnabled("library"), { action: vocab.customerNounPlural, detail: "Search any name, phone or address.", path: "/company/customers" }),
        ],
        tips: [
          "View only: you can open every screen below, but the office or an Admin makes the changes.",
          `Search at the top finds any call, request, ${job} or ${customer}.`,
        ],
        howTo: [],
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
        howTo: [NO_SIGNAL],
      };
  }
}

type Words = GuideContext & { role: GuideRole; job: string; jobs: string; crew: string; crews: string; customer: string };
/** `see` = what the screen shows (every reader); `act` = what you do there (left out of the View only manual). */
type Notes = { see: string[]; act?: string[] };

const SCREEN_NOTES: Record<string, (w: Words) => Notes> = {
  "/company/dashboard": () => ({ see: ["Start here each day: what is new and what needs attention.", "Tap any item to open it. A total is only a summary, so open the item before you decide."] }),
  "/company/calls": () => ({
    see: ["Every call the phone AI answered: a short summary, the transcript and the recording.", "A call is not a booking. The request it made waits in Pipeline."],
    act: ["Check what the caller really said before you confirm anything."],
  }),
  "/company/pipeline": (w) => ({
    see: ["New requests and bookings from calls. Urgent and Escalated ones come first."],
    act: [
      "Review details, then Confirm & email, Call Back, or Decline & notify.",
      ...(w.isEnabled("jobs") ? [`Create ${w.vocab.jobNoun} turns a request into a ${w.job}, with the ${w.customer}'s details filled in.`] : []),
    ],
  }),
  "/company/calendar": (w) => w.calendarMode === "jobs"
    ? {
      see: [`One row per ${w.crew}, one column per day. New ${w.jobs} wait in Unscheduled.`, "Grey dashed cards are not confirmed yet. Colored cards are confirmed."],
      act: [`Drag a ${w.job} onto a ${w.crew} and a day, pick the time, then Confirm + email crew.`, "Tap a card to reschedule it. Undo fixes a wrong move."],
    }
    : {
      see: [`One row per ${w.crew}, one column per day. New bookings wait in Unassigned.`, "Grey dashed cards are not confirmed yet."],
      act: [`Drag a booking onto a ${w.crew} and a day, then confirm it.`, "Tap a card to reschedule it. Undo fixes a wrong move."],
    },
  "/company/jobs": (w) => ({
    see: [`Every ${w.job}, with status filters and search.`, `Inside a ${w.job}: notes, materials, labor, photos${w.quotes ? ", Findings, Quote" : ""}, Report and Invoice.`],
    act: [
      `Send to a worker sends the field link for that ${w.job}. No account needed.`,
      ...(w.multiCompany ? ["Each document says which company it is Sent as. Tap Change to switch."] : []),
    ],
  }),
  // A field login's whole manual is about this screen, so its steps, tips and How to already say the rest (say it once).
  "/company/field": (w) => GUIDE_TEAM_ROLE[w.role] === "crew"
    ? { see: [`Your screen for the day: the ${w.job}, the time clock, notes and photos.`, ...(w.role === "inspector" ? ["My schedule shows your visits for the day."] : [])] }
    : {
      see: [`What the field team uses: the time clock, notes and photos for each ${w.job}.`],
      act: [`Pick the ${w.job}, Clock in, then talk or type what you did. + Photo adds pictures.`, `Check the ${w.job} name at the top before you talk.`, "No signal? Keep working. Everything sends by itself later."],
    },
  "/company/billing": () => ({
    see: ["Owed to you, Past due and Paid this month: who has paid and who is late.", "Reminders go out on their own when Getting paid has them switched on."],
    act: ["When money arrives, open the invoice and tap Record payment."],
  }),
  "/company/finances": (w) => ({
    see: [
      "See who owes you and how much is late: Invoiced, Paid and Owed for the period you pick.",
      ...(w.multiCompany ? ["The company filter shows each company alone, or All for both together."] : []),
    ],
    act: ["Export CSV downloads the list for your accountant."],
  }),
  "/company/payroll": () => ({
    see: ["A preview of recorded hours from the time clock: Regular h, Overtime h and Estimated pay for each person."],
    act: ["Pick This week, Last week or Custom. Export CSV gives your payroll provider the hours."],
  }),
  "/company/customers": (w) => ({
    see: [`Every ${w.customer}, with their ${w.jobs}, documents and history. Search by name, phone or address.`],
    act: [`Search before you add, so each ${w.customer} has one record.`],
  }),
  "/company/library": (w) => ({
    see: [
      ...(w.isEnabled("pricing") ? [`Prices & rates fill in ${w.quotes ? "quotes and invoices" : "invoices"}, so nobody types them twice.`] : []),
      ...(w.isEnabled("jobs") ? [`${w.vocab.resourceNounPlural}: who is on each ${w.crew}. They are the rows on the Calendar.`] : []),
      `Logo: goes on every ${w.quotes ? "quote, report, " : "report, "}invoice and email.`,
      ...(w.quotes && w.isEnabled("jobs") ? ["Work catalog: standard fixes you pick when writing Findings."] : []),
    ],
  }),
  "/company/team": () => ({
    see: ["Everyone who can sign in, and their type."],
    act: ["Invite person: their name, email and type, then Send invite.", "Everyone gets their own login. Never share one.", "When someone leaves, tap Disable access."],
  }),
  "/company/settings": (w) => ({
    see: [
      "Company details, Hours & timezone, Phone & notifications, Getting paid and Documents.",
      ...(w.isEnabled("calls") ? ["The phone AI books only inside your hours."] : []),
    ],
    act: [
      "Change what you need, tap Save Changes, and wait for the saved message.",
      ...(GUIDE_TEAM_ROLE[w.role] === "staff" ? ["Getting paid belongs to the owner: you can read it, not change it."] : []),
    ],
  }),
};

/** "Your screens" for one guide: every screen that role's menu shows (Guide and Feedback aside), in menu order. */
export function screensFor(role: GuideRole, ctx: GuideContext): GuideScreen[] {
  const words: Words = {
    ...ctx, role,
    job: lower(ctx.vocab.jobNoun), jobs: lower(ctx.vocab.jobNounPlural), crew: lower(ctx.vocab.resourceNoun),
    crews: lower(ctx.vocab.resourceNounPlural), customer: lower(ctx.vocab.customerNoun),
  };
  const view = role === "viewer";
  return visibleNavLinks({ role: GUIDE_TEAM_ROLE[role], isEnabled: ctx.isEnabled, vocab: ctx.vocab, showcase: ctx.showcase })
    .filter((link) => !link.locked && SCREEN_NOTES[link.path])
    .map((link) => {
      const notes = SCREEN_NOTES[link.path](words);
      return { path: link.path, name: link.label, bullets: [...notes.see, ...(view ? [] : notes.act ?? [])] };
    })
    .filter((screen) => screen.bullets.length > 0);
}

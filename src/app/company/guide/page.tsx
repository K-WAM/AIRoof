"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  LayoutDashboard, Phone, Workflow, Briefcase, Mic, CalendarDays, BookOpen, Settings,
  PhoneCall, ClipboardList, FileText, CalendarCheck, Sparkles, type LucideIcon,
} from "lucide-react";
import { useBusinessModules, type CompanyModule } from "@/hooks/useBusinessModules";

export default function GuidePage() {
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const sfx = preview ? `?preview=${preview}` : "";
  const { isEnabled, vocab, calendarMode } = useBusinessModules();

  // The Guide must describe the tabs this industry actually has — a dental
  // office should never read about logging materials on a job site.
  const show = (m: CompanyModule | null) => !m || isEnabled(m);
  const hasJobs = isEnabled("jobs");
  const apptMode = calendarMode === "appointments";

  const workflow = [...WORKFLOW.filter((s) => show(s.module)), CALENDAR_STEP[calendarMode]];

  // Calendar + Library exist for everyone, but describe themselves per industry.
  const tabs = [
    ...TABS.filter((t) => show(t.module)),
    {
      label: "Calendar",
      path: "/company/calendar",
      Icon: CalendarDays,
      body: apptMode
        ? `Drag a booking onto a ${vocab.resourceNoun.toLowerCase()} and day. Confirm to email the ${vocab.customerNoun.toLowerCase()}.`
        : `Drag ${vocab.jobNounPlural.toLowerCase()} onto a crew and day. Confirm to email the crew and lock the schedule.`,
    },
    ...(isEnabled("library")
      ? [{
          label: "Library",
          path: "/company/library",
          Icon: BookOpen,
          body: isEnabled("pricing")
            ? `Your pricing, ${vocab.resourceNounPlural.toLowerCase()}, and documents. Invoices auto-fill prices from here.`
            : `Your ${vocab.resourceNounPlural.toLowerCase()} and documents. ${vocab.resourceNounPlural} become the rows on your Calendar.`,
        }]
      : []),
  ];

  const howtos = [
    {
      title: `Add a ${vocab.resourceNoun.toLowerCase()}`,
      Icon: ClipboardList,
      steps: [
        `Go to Library → ${vocab.resourceNounPlural} tab.`,
        "Enter the name + email.",
        `Click “Add ${vocab.resourceNoun.toLowerCase()}.”`,
        "They now appear as a row on the Calendar.",
      ],
    },
    {
      title: apptMode ? "Assign a booking" : `Schedule a ${vocab.jobNoun.toLowerCase()}`,
      Icon: CalendarCheck,
      steps: apptMode
        ? [
            "Open Calendar.",
            `Drag a booking from “Unassigned” onto a ${vocab.resourceNoun.toLowerCase()} + day.`,
            "Click “Confirm + email” to lock it in and notify them.",
          ]
        : [
            "Open Calendar.",
            `Drag a ${vocab.jobNoun.toLowerCase()} from “Unscheduled” onto a crew + day.`,
            "Click “Confirm + email crew” to lock it in and notify them.",
          ],
    },
    ...HOWTOS.filter((h) => show(h.module)),
  ];

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">How this works</h1>
          <p className="page-subtitle">
            A 2-minute tour. Your AI receptionist answers the phone 24/7 — everything else you manage from the tabs on the left.
          </p>
        </div>
      </header>

      {/* ── The big idea ───────────────────────────────────────── */}
      <section className="panel" style={{ marginBottom: 20, borderColor: "var(--accent)", borderWidth: 1 }}>
        <div className="panel-body" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Sparkles size={22} style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>
              {hasJobs ? "Talk, don't type." : "Your phone is never unanswered."}
            </h2>
            {hasJobs ? (
              <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 760 }}>
                The agent answers calls, books appointments, and captures leads on its own. Out in the field, you just
                <strong style={{ color: "var(--text)" }}> hold the mic and speak</strong> — &ldquo;{vocab.voiceExample}&rdquo; — and the app turns it into clean materials, labor, and issues on the {vocab.jobNoun.toLowerCase()}. No forms, no typing.
              </p>
            ) : (
              <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 760 }}>
                The agent picks up <strong style={{ color: "var(--text)" }}>every call, 24/7</strong> — including nights and weekends.
                It answers your common questions, books the appointment, and flags anything urgent for you.
                You review it all here in the morning: nothing gets missed, and no one sits on hold.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── The workflow ───────────────────────────────────────── */}
      <SectionTitle>Your workflow, start to finish</SectionTitle>
      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-body">
          <ol style={{ display: "grid", gap: 14, margin: 0, padding: 0, listStyle: "none" }}>
            {workflow.map((s, i) => (
              <li key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <span style={{ minWidth: 28, height: 28, borderRadius: 999, background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                <div>
                  <p style={{ margin: "3px 0 2px", fontWeight: 700, fontSize: 14 }}>{s.title}</p>
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.5 }}>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── What each tab does ─────────────────────────────────── */}
      <SectionTitle>What each tab does</SectionTitle>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginBottom: 24 }}>
        {tabs.map((t) => (
          <Link key={t.label} href={`${t.path}${sfx}`} className="panel" style={{ textDecoration: "none", color: "inherit", display: "block", transition: "box-shadow 0.12s, transform 0.1s" }}>
            <div className="panel-body" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <t.Icon size={18} style={{ color: "var(--accent)" }} />
              </div>
              <div>
                <p style={{ margin: "2px 0 3px", fontWeight: 700, fontSize: 14 }}>{t.label}</p>
                <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13, lineHeight: 1.45 }}>{t.body}</p>
              </div>
            </div>
          </Link>
        ))}
      </section>

      {/* ── Common how-tos ─────────────────────────────────────── */}
      <SectionTitle>Quick how-tos</SectionTitle>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {howtos.map((h) => (
          <article key={h.title} className="panel">
            <div className="panel-body">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <h.Icon size={16} style={{ color: "var(--accent)" }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{h.title}</h3>
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, color: "var(--text-muted)", fontSize: 13, lineHeight: 1.7 }}>
                {h.steps.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            </div>
          </article>
        ))}
      </section>

      <p style={{ marginTop: 24, color: "var(--text-muted)", fontSize: 13 }}>
        Stuck on something? Everything is reversible — explore freely, nothing destructive happens without a confirmation.
      </p>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "0 0 10px" }}>
      {children}
    </p>
  );
}

// `module: null` = every industry sees it. Anything tagged with a module is
// filtered out for industries that don't use it (see useBusinessModules).
const WORKFLOW: { title: string; body: string; module: CompanyModule | null }[] = [
  { module: null, title: "The agent answers the phone", body: "Day or night, your AI receptionist greets callers, answers questions, books appointments, and captures leads — even after hours." },
  { module: null, title: "Review in Pipeline", body: "New leads and appointments land in Pipeline. Call a lead back or confirm an appointment in one tap right from the list." },
  { module: null, title: "Approve after-hours bookings", body: "Anything booked while you were closed shows up on the Dashboard as “Pending Your Approval.” One click confirms it and emails the customer." },
  { module: "jobs", title: "Turn it into a Job", body: "From an appointment, click Create Job. The job tracks everything: timeline, materials, labor, photos, invoice, and report." },
  { module: "jobs", title: "Log work from the field — by voice", body: "On site, open Field, hold the mic, and say what happened. AI fills in materials, hours, and issues. Say “make that 15, not 12” and it fixes the number." },
  { module: "jobs", title: "Generate the invoice or report", body: "Open the job and click Generate Invoice or Generate Report. Prices auto-fill from your Library. Review, then send or save as PDF." },
];

// Calendar exists for every industry, but the board means different things:
// field service schedules crews onto jobs; intake assigns bookings to people.
const CALENDAR_STEP = {
  jobs: { title: "Schedule the crew", body: "On the Calendar, drag the job onto a crew and a day, then Confirm — it emails the crew their assignment and locks it in." },
  appointments: { title: "Assign it on the Calendar", body: "Drag the booking onto whoever's taking it and the right day, then Confirm — it emails the customer their confirmed time." },
} as const;

const TABS: { label: string; path: string; Icon: LucideIcon; body: string; module: CompanyModule | null }[] = [
  { module: null, label: "Dashboard", path: "/company/dashboard", Icon: LayoutDashboard, body: "Your home base — today's urgent leads, appointments, and anything waiting on your approval." },
  { module: null, label: "Calls", path: "/company/calls", Icon: Phone, body: "Every call the agent answered. Play the recording and read the full transcript." },
  { module: null, label: "Pipeline", path: "/company/pipeline", Icon: Workflow, body: "Leads and appointments. Call back, mark contacted, or confirm — one tap each." },
  { module: "jobs", label: "Jobs", path: "/company/jobs", Icon: Briefcase, body: "Each job's materials, labor, photos, invoice, and report in one place." },
  { module: "jobs", label: "Field", path: "/company/field", Icon: Mic, body: "The on-site screen. Hold the mic and speak your update — AI does the paperwork." },
  { module: null, label: "Settings", path: "/company/settings", Icon: Settings, body: "Your agent's name, business hours, and contact details." },
];

const HOWTOS: { title: string; Icon: LucideIcon; steps: string[]; module: CompanyModule | null }[] = [
  { module: "jobs", title: "Log a field update by voice", Icon: Mic, steps: ["Open Field and pick the job.", "Hold the mic and speak naturally.", "Release — AI extracts materials, labor, and issues onto the job."] },
  { module: "jobs", title: "Send an invoice", Icon: FileText, steps: ["Open the job → click Generate Invoice.", "Review the auto-filled line items.", "Click Send to Customer, or Print / Save as PDF."] },
  { module: null, title: "Call a customer back", Icon: PhoneCall, steps: ["Open Pipeline.", "Find the lead or appointment.", "Click “Call Back” right on the card."] },
  { module: null, title: "Confirm an after-hours booking", Icon: CalendarCheck, steps: ["Open Dashboard.", "Find “Pending Your Approval.”", "Click “Confirm & notify customer” — it emails them the details."] },
];

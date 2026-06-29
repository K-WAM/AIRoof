"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  LayoutDashboard, Phone, Workflow, Briefcase, Mic, CalendarDays, BookOpen, Settings,
  PhoneCall, ClipboardList, FileText, CalendarCheck, Sparkles, type LucideIcon,
} from "lucide-react";

export default function GuidePage() {
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const sfx = preview ? `?preview=${preview}` : "";

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
            <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>Talk, don&apos;t type.</h2>
            <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 760 }}>
              The agent answers calls, books appointments, and captures leads on its own. Out in the field, you just
              <strong style={{ color: "var(--text)" }}> hold the mic and speak</strong> — &ldquo;used 12 bundles of shingles, Kevin worked 8 to 4, found a cracked vent&rdquo; — and the app turns it into clean materials, labor, and issues on the job. No forms, no typing.
            </p>
          </div>
        </div>
      </section>

      {/* ── The workflow ───────────────────────────────────────── */}
      <SectionTitle>Your workflow, start to finish</SectionTitle>
      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-body">
          <ol style={{ display: "grid", gap: 14, margin: 0, padding: 0, listStyle: "none" }}>
            {WORKFLOW.map((s, i) => (
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
        {TABS.map((t) => (
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
        {HOWTOS.map((h) => (
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

const WORKFLOW: { title: string; body: string }[] = [
  { title: "The agent answers the phone", body: "Day or night, your AI receptionist greets callers, answers questions, books appointments, and captures leads — even after hours." },
  { title: "Review in Pipeline", body: "New leads and appointments land in Pipeline. Call a lead back or confirm an appointment in one tap right from the list." },
  { title: "Turn it into a Job", body: "From an appointment, click Create Job. The job tracks everything: timeline, materials, labor, photos, invoice, and report." },
  { title: "Log work from the field — by voice", body: "On site, open Field, hold the mic, and say what happened. AI fills in materials, hours, and issues. Say “make that 15, not 12” and it fixes the number." },
  { title: "Generate the invoice or report", body: "Open the job and click Generate Invoice or Generate Report. Prices auto-fill from your Library. Review, then send or save as PDF." },
  { title: "Schedule the crew", body: "On the Calendar, drag the job onto a crew and a day, then Confirm — it emails the crew their assignment and locks it in." },
];

const TABS: { label: string; path: string; Icon: LucideIcon; body: string }[] = [
  { label: "Dashboard", path: "/company/dashboard", Icon: LayoutDashboard, body: "Your home base — today's urgent leads, appointments, and active jobs at a glance." },
  { label: "Calls", path: "/company/calls", Icon: Phone, body: "Every call the agent answered. Play the recording and read the full transcript." },
  { label: "Pipeline", path: "/company/pipeline", Icon: Workflow, body: "Leads and appointments. Call back, mark contacted, or confirm — one tap each." },
  { label: "Jobs", path: "/company/jobs", Icon: Briefcase, body: "Each job's materials, labor, photos, invoice, and report in one place." },
  { label: "Field", path: "/company/field", Icon: Mic, body: "The on-site screen. Hold the mic and speak your update — AI does the paperwork." },
  { label: "Calendar", path: "/company/calendar", Icon: CalendarDays, body: "Drag jobs onto a crew and day. Confirm to email the crew and lock the schedule." },
  { label: "Library", path: "/company/library", Icon: BookOpen, body: "Your pricing, crews, and documents. Invoices auto-fill prices from here." },
  { label: "Settings", path: "/company/settings", Icon: Settings, body: "Your agent's name, business hours, and contact details." },
];

const HOWTOS: { title: string; Icon: LucideIcon; steps: string[] }[] = [
  { title: "Create a crew", Icon: ClipboardList, steps: ["Go to Library → Crews tab.", "Enter the crew name + email.", "Click “Add crew.”", "They now appear on the Calendar to schedule."] },
  { title: "Schedule a job", Icon: CalendarCheck, steps: ["Open Calendar.", "Drag a job from “Unscheduled” onto a crew + day.", "Click “Confirm + email crew” to lock it in and notify them."] },
  { title: "Log a field update by voice", Icon: Mic, steps: ["Open Field and pick the job.", "Hold the mic and speak naturally.", "Release — AI extracts materials, labor, and issues onto the job."] },
  { title: "Send an invoice", Icon: FileText, steps: ["Open the job → click Generate Invoice.", "Review the auto-filled line items.", "Click Send to Customer, or Print / Save as PDF."] },
  { title: "Call a customer back", Icon: PhoneCall, steps: ["Open Pipeline.", "Find the lead or appointment.", "Click “Call Back” right on the card."] },
];

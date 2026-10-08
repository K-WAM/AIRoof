"use client";

// Superadmin Playbook (rewritten 2026-10-04, owner: "confusing, unreadable and stale … less text, readable and
// scannable"). One tab per job the superadmin does: run a demo, set up a client, understand crews and the field,
// know which AI does what and what it costs, and bill. Every step is one line + a button to the screen it names.
// Numbers that can change (rates, the demo line) come from code, never retyped here. The old long HTML guides stay
// under "Printable" for anyone who wants paper.

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { AI_COST_RATES, type AiCostRate } from "@/lib/billing/aiCostRates";
import { ProviderStatusStrip } from "@/components/admin/ProviderStatusStrip";
import { DEMO_LINE_PHONE } from "@/lib/verticals/templates";

type TabId = "demo" | "client" | "field" | "ai" | "billing" | "print";
const TABS: Array<{ id: TabId; label: string }> = [
  { id: "demo", label: "Run a demo" },
  { id: "client", label: "Set up a client" },
  { id: "field", label: "Crews & field" },
  { id: "ai", label: "AI & costs" },
  { id: "billing", label: "Billing" },
  { id: "print", label: "Printable" },
];
const TAB_KEY = "playbookTab";

// The one place the demo number lives (Demo Studio and /try read the same map).
const DEMO_LINE = DEMO_LINE_PHONE.roofing ?? "the demo line";

interface Step { text: ReactNode; see?: string; href?: string; go?: string; time?: string }

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="pb-steps">
      {steps.map((s, i) => (
        <li key={i}>
          <span className="pb-num" aria-hidden>{i + 1}</span>
          <div className="pb-body">
            <div className="pb-text">{s.time && <span className="pb-time">{s.time}</span>}{s.text}</div>
            {s.see && <div className="pb-see">You should see: {s.see}</div>}
          </div>
          {s.href && <Link className="button small" href={s.href}>{s.go ?? "Open"}</Link>}
        </li>
      ))}
    </ol>
  );
}

function Section({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="panel pb-section">
      <div className="panel-header"><h2 className="panel-title">{title}</h2></div>
      <div className="panel-body">{children}{note && <p className="pb-note">{note}</p>}</div>
    </section>
  );
}

function DemoTab() {
  return (
    <>
      <Section title="Before the call (2 min)">
        <Steps steps={[
          { text: <>Demo Studio → pick the industry, type the prospect&apos;s company → <b>Launch</b>.</>, see: `the demo line ${DEMO_LINE} now answers as their company`, href: "/hub/demo", go: "Demo Studio" },
          { text: "Open the client view in a second tab.", href: "/company/dashboard?preview=demo-roofing", go: "Client view" },
        ]} />
      </Section>
      <Section title="The 20-minute demo (roofing)" note={<>Bilingual crew? Do step 3 in Spanish — the note is saved in English, the original kept.</>}>
        <Steps steps={[
          { time: "0–4", text: <>Prospect calls <b>{DEMO_LINE}</b> and asks for a roof inspection.</>, see: "the AI answers as their company and books a time" },
          { time: "4–8", text: <>Pipeline → open the new request → <b>Create job</b>.</>, see: "the transcript and the caller's details on the job", href: "/company/pipeline?preview=demo-roofing", go: "Pipeline" },
          { time: "8–13", text: <>On the job: <b>Send to a worker</b> → your phone → open the text → type a name → hold the mic: &ldquo;six cracked tiles, pipe boot split&rdquo;.</>, see: "materials, labor and issues fill in on the office screen" },
          { time: "13–16", text: <><b>Findings</b> → tick the fixes → <b>Quote</b> → send it to the prospect&apos;s email.</>, see: "a branded quote with before/after photos in their inbox" },
          { time: "16–20", text: <><b>Mark work complete</b> → <b>Report</b> → <b>Invoice</b> → send.</>, see: "report (no prices) and invoice, same letterhead" },
        ]} />
      </Section>
      <Section title="After">
        <Steps steps={[{ text: <>Demo Studio → <b>Reset demo</b> so the next prospect starts clean.</>, href: "/hub/demo", go: "Demo Studio" }]} />
      </Section>
    </>
  );
}

function ClientTab() {
  return (
    <>
      <Section title="Go-live checklist (about 30 min)">
        <Steps steps={[
          { text: <><b>New client</b>: company, industry, hours, services, owner&apos;s email.</>, see: "the owner gets a set-password email", href: "/hub/onboarding", go: "New client" },
          { text: <>Client → <b>Products</b>: switch on only what the contract includes — AI calls &amp; booking, Jobs &amp; field input, Billing &amp; payments.</>, see: "the client's menu shows only those; everything else is refused", href: "/admin/businesses", go: "Clients" },
          { text: <>Client → <b>Phone provider</b>: ElevenLabs agent ID + number (skip if they didn&apos;t buy AI calls).</>, href: "/admin/businesses", go: "Clients" },
          { text: <>Client → <b>Phone lines</b>: <b>Record test call</b> → <b>Go live…</b></>, see: "the line reads Live" },
          { text: "Call the line once.", see: "the call appears in the client's Calls within seconds" },
          { text: <>Spanish: nothing to set — every line speaks both. New ElevenLabs agent? Run the bilingual script once (AI &amp; costs tab).</> },
          { text: <>Billing: <b>Invoices</b> → first invoice (or turn on monthly auto-draft on the client).</>, href: "/admin/invoices", go: "Invoices" },
        ]} />
      </Section>
      <Section title="The client does the rest (no superadmin needed)">
        <ul className="pb-list">
          <li><b>Team</b> — their Admin invites people, picks a type (Office staff, Inspector, Technician, View only), locks or removes them.</li>
          <li><b>Library</b> — Load starter kit, then their logo, crews and prices.</li>
          <li><b>Customers</b> — added automatically from calls; schools and businesses get a contact person.</li>
        </ul>
      </Section>
    </>
  );
}

function FieldTab() {
  const roles: Array<[string, string]> = [
    ["Admin", "Everything, including Team and Settings."],
    ["Office staff", "Pipeline, Calendar, jobs, quotes, invoices."],
    ["Inspector", "Field screen + their own schedule: findings, photos, notes. No prices."],
    ["Foreman", "Field screen: logs the voice notes (English or Spanish), photos, findings, time clock. No prices."],
    ["Technician", "Field screen: time clock, photos; logs notes when filling in for the foreman. No prices."],
    ["View only", "Looks at the office screens, changes nothing."],
    ["Contractor (no login)", "Gets a job link by text or email, types their name. That's it."],
  ];
  return (
    <>
      <Section title="Who sees what">
        <table className="pb-table"><tbody>{roles.map(([r, d]) => <tr key={r}><th>{r}</th><td>{d}</td></tr>)}</tbody></table>
      </Section>
      <Section title="Assign a crew to a job">
        <Steps steps={[
          { text: <>Calendar → drag the job onto a crew and day → pick a time.</>, see: "a grey (not confirmed) block" },
          { text: <><b>Confirm</b>.</>, see: "the crew and each member with an email get the job details" },
          { text: <>The job page shows the crew and time under the customer (<b>Schedule on the Calendar</b> when there&apos;s none).</> },
        ]} />
      </Section>
      <Section title="How workers log work" note="Every note carries who sent it: the login name, or the name typed on the link.">
        <ul className="pb-list">
          <li><b>Has a login</b> → Field tab. Their crew&apos;s jobs first; any job is one search away (subs and fill-ins welcome).</li>
          <li><b>No login</b> → job page → <b>Send to a worker</b> → phone or email. One link per job, works every day, <b>Stop link</b> ends it.</li>
          <li><b>Time clock</b> → Clock in at the office or on site, Lunch, Clock out. Office time is paid, not billed to a job.</li>
        </ul>
      </Section>
    </>
  );
}

function money(n: number) { return `$${n >= 0.01 ? n.toFixed(2) : n.toFixed(3)}`; }

function AiTab() {
  return (
    <>
      <Section title="Balances right now" note="Top up before a balance hits zero — when one runs out, that feature stops (calls still answer if ElevenLabs is charged).">
        <ProviderStatusStrip />
      </Section>
      <Section title="Which AI does what" note={<>Rates are estimates kept in one file (<code>src/lib/billing/aiCostRates.ts</code>); the Usage page multiplies them by real usage.</>}>
        <table className="pb-table">
          <thead><tr><th>Feature</th><th>Model / service</th><th>Est. cost</th></tr></thead>
          <tbody>{AI_COST_RATES.map((r: AiCostRate) => <tr key={r.id}><th>{r.feature}</th><td>{r.model}</td><td>{money(r.usd)} {r.unit}</td></tr>)}</tbody>
        </table>
        <p className="pb-note">Quotes, invoices and reports use <b>no AI</b> — they are built from the job&apos;s own data.</p>
      </Section>
      <Section title="Keep them charged">
        <ul className="pb-list">
          <li><b>ElevenLabs</b> (phone calls) — elevenlabs.io → Subscription. Pick a plan with enough minutes; turn on usage-based billing so calls never stop.</li>
          <li><b>OpenAI</b> (voice notes, reading notes) — platform.openai.com → Billing → <b>Auto recharge</b> on, e.g. refill $20 when under $5.</li>
          <li><b>DeepSeek</b> (call summaries) — platform.deepseek.com → Top up. If it runs out, summaries switch to OpenAI automatically.</li>
          <li><b>Resend</b> (all email) and <b>Twilio</b> (texts, when on) — monthly plans; check once a month.</li>
        </ul>
      </Section>
      <Section title="Spanish — always on">
        <ul className="pb-list">
          <li><b>Every line, every call:</b> starts in English, follows the caller into Spanish and back, even mid-sentence. No setting to turn on.</li>
          <li><b>Field voice notes:</b> English, Spanish or both in one note. The job stores English; the original words are kept.</li>
          <li><b>Once per ElevenLabs agent</b> (at the PC with the key): <code>node scripts/elevenlabs-bilingual.mjs --agent-id …</code> — checks the voice model, adds Spanish, turns on language detection. Dry run first, then <code>--apply</code>.</li>
        </ul>
      </Section>
    </>
  );
}

function BillingTab() {
  return (
    <>
      <Section title="Monthly billing">
        <Steps steps={[
          { text: <>Invoices → <b>New</b> → pick the client → <b>Send</b>.</>, see: "the client gets the invoice by email, with a Pay link when Stripe is on", href: "/admin/invoices", go: "Invoices" },
          { text: <>Or tick <b>Auto-draft a monthly invoice</b> on the client — it is never sent until you press Send.</>, href: "/admin/businesses", go: "Clients" },
          { text: <>Paid? Press <b>Mark paid</b>.</>, see: "the client gets a “Payment received” email automatically" },
        ]} />
      </Section>
      <Section title="Late payments (automatic)">
        <ul className="pb-list">
          <li>Reminder emails go out at <b>1, 7 and 14 days</b> overdue. Each is sent once.</li>
          <li>Still unpaid → Invoices shows <b>Overdue</b> → <b>Pause client</b>. Their dashboard locks; <b>the phone keeps answering</b> so their callers are never dropped.</li>
          <li>Paid → <b>Mark paid</b>. A client paused for that invoice turns back on by itself (or <b>Resume</b> on their client page).</li>
        </ul>
      </Section>
      <Section title="Your clients' own invoices (Billing product, no Stripe)">
        <ul className="pb-list">
          <li>The client sets <b>Settings → Getting paid</b>: how their customers pay (Zelle, checks…), an optional pay link to their own Square/PayPal page, payment terms.</li>
          <li>It prints as <b>How to pay</b> on every invoice. Their customer pays them directly — no money passes through Luxor.</li>
          <li>On the job&apos;s Invoice tab they press <b>Record payment</b> (partial payments add up); the customer gets a receipt. Overdue reminders go out at 1, 7 and 14 days.</li>
          <li>Their <b>Billing</b> screen shows what&apos;s owed, past due and paid this month.</li>
        </ul>
      </Section>
      <Section title="Know what each client costs you">
        <Steps steps={[{ text: <>Usage → this month&apos;s calls, minutes, voice notes and estimated AI cost per client.</>, href: "/admin/usage", go: "Usage" }]} />
      </Section>
    </>
  );
}

function PrintTab() {
  const docs: Array<[string, string]> = [
    ["Full demo + onboarding guide", "/guides/onboarding-guide.html"],
    ["Field operations guide (for crews)", "/guides/field-operations-guide.html"],
    ["Pitch deck (2 pages)", "/guides/pitch-deck.html"],
  ];
  return (
    <Section title="Printable guides" note="Open, then Print → Save as PDF. The tabs here are the up-to-date short version.">
      <ul className="pb-list">{docs.map(([l, h]) => <li key={h}><a href={h} target="_blank" rel="noreferrer">{l} <ExternalLink size={12} /></a></li>)}</ul>
    </Section>
  );
}

export default function AdminGuidePage() {
  const [tab, setTab] = useState<TabId>("demo");
  useEffect(() => { try { const t = localStorage.getItem(TAB_KEY) as TabId | null; if (t && TABS.some((x) => x.id === t)) setTab(t); } catch { /* private mode */ } }, []);
  const pick = (t: TabId) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* private mode */ } };
  return (
    <>
      <header className="page-header" style={{ marginBottom: "var(--sp-4)" }}>
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <BookOpen size={20} strokeWidth={1.75} /> Playbook
          </h1>
          <p className="page-subtitle">Short steps, a button for each screen.</p>
        </div>
      </header>
      <nav className="pb-tabs" role="tablist" aria-label="Playbook">
        {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="filter-chip" onClick={() => pick(t.id)}>{t.label}</button>)}
      </nav>
      <div role="tabpanel" className="pb-panel">
        {tab === "demo" && <DemoTab />}
        {tab === "client" && <ClientTab />}
        {tab === "field" && <FieldTab />}
        {tab === "ai" && <AiTab />}
        {tab === "billing" && <BillingTab />}
        {tab === "print" && <PrintTab />}
      </div>
    </>
  );
}

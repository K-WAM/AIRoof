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

// `tick` (the onboarding checklist) turns each number into a tick-off button; the ticks live in this browser only.
interface Tick { id: string; done: Record<string, boolean>; toggle: (key: string) => void }

function Steps({ steps, tick }: { steps: Step[]; tick?: Tick }) {
  return (
    <ol className="pb-steps">
      {steps.map((s, i) => (
        <li key={i} className={tick?.done[`${tick.id}-${i}`] ? "pb-done" : undefined}>
          {tick ? (
            <button type="button" className="pb-num pb-check" aria-pressed={!!tick.done[`${tick.id}-${i}`]} aria-label={`Step ${i + 1} done`} onClick={() => tick.toggle(`${tick.id}-${i}`)}>
              {tick.done[`${tick.id}-${i}`] ? "✓" : i + 1}
            </button>
          ) : <span className="pb-num" aria-hidden>{i + 1}</span>}
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

// Onboarding playbook (2026-10-18, owner: "easy, simple, compact … to onboard"). Five stages in order, one line per step,
// tick each off as you go. One ElevenLabs agent per client (owner decision) — never share an agent between clients.
const TICK_KEY = "onboardTicks";
const CLIENTS = "/admin/businesses";

function ClientTab() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setDone(JSON.parse(localStorage.getItem(TICK_KEY) ?? "{}")); } catch { /* private mode */ } }, []);
  const save = (next: Record<string, boolean>) => { setDone(next); try { localStorage.setItem(TICK_KEY, JSON.stringify(next)); } catch { /* private mode */ } };
  const tick = (id: string): Tick => ({ id, done, toggle: (key) => save({ ...done, [key]: !done[key] }) });
  const count = Object.values(done).filter(Boolean).length;

  return (
    <>
      <Section title="Get from the client first" note="Missing any of these is what stalls a launch.">
        <ul className="pb-list">
          <li>Company, industry, owner&apos;s name + email, main phone, service area, timezone, hours per day.</li>
          <li>Services they sell, their top 5–10 FAQs with answers, what counts as an emergency + who to call.</li>
          <li>Number: <b>new</b>, <b>forward</b> theirs, or <b>port</b> it (slowest). Receptionist name + greeting.</li>
          <li>Logo (PNG), brand color, public phone/email, prices, labor + tax rate, staff list with roles.</li>
          <li>What they bought, the monthly price, how many logins.</li>
        </ul>
      </Section>

      <Section title="1 · Create the client (10 min)">
        <Steps tick={tick("create")} steps={[
          { text: <><b>New client</b> → fill all 7 steps. Edit the services + FAQs now — there&apos;s no editor for them later.</>, href: "/hub/onboarding", go: "New client" },
          { text: <>Copy the owner&apos;s <b>temporary password</b> (shown once) and send it privately.</>, see: "lost it? Client → Client Login → Provision Login" },
          { text: <>Client → <b>Products</b>: turn <b>off</b> what they didn&apos;t buy (all start on).</>, href: CLIENTS, go: "Clients" },
          { text: <>Client → <b>Subscription &amp; Billing</b>: seat limit, plan name, monthly amount, billing day.</> },
        ]} />
      </Section>

      <Section title="2 · Their own agent + phone number (20 min)" note="Skip this stage if they didn't buy AI calls & booking.">
        <Steps tick={tick("phone")} steps={[
          { text: <>Twilio: buy a local number (account must be paid, not Trial).</> },
          { text: <>ElevenLabs: <b>duplicate the base agent</b> and name it after the client — one agent per client, never shared. Set a max call length.</> },
          { text: <>At the PC: <code>node scripts/setup-elevenlabs-agent.mjs --agent-id …</code>, then again with <code>--apply</code>.</>, see: "the 7 booking tools + start-of-call webhook attached" },
          { text: <>Same for Spanish: <code>node scripts/elevenlabs-bilingual.mjs --agent-id …</code>, then <code>--apply</code>.</> },
          { text: <>ElevenLabs → Phone Numbers: import the Twilio number, assign it to the client&apos;s agent.</> },
          { text: <>Client → <b>Phone provider</b>: ElevenLabs, agent ID, phone number ID, number as <code>+1…</code> → <b>Save config</b>.</>, href: CLIENTS, go: "Clients" },
          { text: <>Client → <b>Phone lines</b> → <b>Add a line</b> → <b>Mark connected (ElevenLabs)</b>.</> },
          { text: <>Call it, book a test visit → copy the call ID from their <b>Calls</b> → <b>Record test call</b> → <b>Go live…</b></>, see: "the line reads Live" },
        ]} />
      </Section>

      <Section title="3 · Agent words, brand, Library (10 min)">
        <Steps tick={tick("setup")} steps={[
          { text: <>Client → <b>AI Model and Voice</b>: name, greeting, after-hours greeting. <b>Services and Rules</b>: emergency + booking rules. <b>Routing</b>: escalation phone, notification email.</>, href: CLIENTS, go: "Clients" },
          { text: <>Client → <b>Branding</b>: color, public phone/email, website. <b>Job Pricing</b>: labor rate, tax rate.</> },
          { text: <><b>Preview ↗</b> → Library → <b>Branding</b>: upload the logo, set it as default.</> },
          { text: <>Library → <b>Load starter kit</b> → swap every “Starter — review price” for their real price → add <b>Crews</b>.</> },
          { text: <>Settings → <b>Advanced</b>: recording notice on or off (draft wording — confirm with the client).</> },
        ]} />
      </Section>

      <Section title="4 · Prove it works (15 min)">
        <Steps tick={tick("test")} steps={[
          { text: "Test calls: book in hours · ask an FAQ · ask about stocks · say an emergency · switch to Spanish · call after hours.", see: "each in their Calls; the booking in Pipeline + Calendar; urgent call rings the escalation phone" },
          { text: <>One full job in Preview: request → <b>Create job</b> → <b>Send to a worker</b> → voice note → Quote → Report → Invoice.</>, see: "their logo on all three; no prices on the report" },
          { text: <>Cancel the test bookings and close the test job.</> },
          { text: <>Client → <b>Launch Readiness</b>: tick all six → <b>Save config</b>.</>, href: CLIENTS, go: "Clients" },
        ]} />
      </Section>

      <Section title="5 · Hand over + bill (30 min)">
        <Steps tick={tick("handover")} steps={[
          { text: <>Call the owner: their Dashboard checklist, Team → <b>Invite person</b>, crews, Settings → <b>Getting paid</b>.</> },
          { text: <>Tell them: the AI never creates jobs — they review each request in Pipeline. Changes to services/FAQs go to you.</> },
          { text: <>Send crews the field guide (Printable tab).</> },
          { text: <><b>Invoices</b> → first invoice, or tick <b>Auto-draft a monthly invoice</b> on the client.</>, href: "/admin/invoices", go: "Invoices" },
          { text: <>Week 1: read two of their call transcripts a day; check <b>Usage</b> on day 7.</>, href: "/admin/usage", go: "Usage" },
        ]} />
      </Section>

      <div className="button-row" style={{ marginTop: 0 }}>
        <span className="pb-note">{count} step{count === 1 ? "" : "s"} ticked</span>
        {count > 0 && <button type="button" className="button small" onClick={() => { if (window.confirm("Clear all ticks for the next client?")) save({}); }}>Start next client</button>}
      </div>
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
          { text: <>Invoices → <b>New</b> → pick the client → <b>Send</b>.</>, see: "the client gets the invoice by email, with a Pay link when Stripe is on and a Zelle line once you add your Zelle under 'How clients pay you' on that page", href: "/admin/invoices", go: "Invoices" },
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

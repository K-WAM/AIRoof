// Public demo entry. Roofing offers a private personalized browser demo;
// the separate shared phone line and per-industry viewer samples remain available.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhoneCall, ArrowDown, CalendarDays } from "lucide-react";
import { VERTICAL_TEMPLATES, DEMO_LINE_PHONE, demoAgentName, type VerticalId } from "@/lib/verticals/templates";
import { VERTICAL_PITCH } from "@/lib/verticals/pitch";
import { RoofingTrial } from "@/components/demo/RoofingTrial";
import { liveDemoUrl } from "@/lib/demo/liveDemoUrl";
import { CopyPhoneButton } from "./CopyPhoneButton";
import { EnterSandboxButton } from "./EnterSandboxButton";

type RouteParams = { vertical: string };

function isVerticalId(value: string): value is VerticalId {
  return Object.prototype.hasOwnProperty.call(VERTICAL_TEMPLATES, value);
}

export function generateStaticParams(): RouteParams[] {
  return Object.keys(VERTICAL_TEMPLATES).map((vertical) => ({ vertical }));
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { vertical } = await params;
  if (!isVerticalId(vertical)) return {};
  const t = VERTICAL_TEMPLATES[vertical];
  if (vertical === "roofing") return { title: "Roofing Demo | Luxor", description: "24-hour English and Spanish reception, bookings in the app, and voice updates straight to the job." };
  const title = `${t.label} AI Receptionist — Live Demo`;
  const description = VERTICAL_PITCH[vertical].headline;
  return { title, description, openGraph: { title, description } };
}

const muted: React.CSSProperties = { margin: "6px 0 14px", fontSize: 14, color: "var(--text-muted)", lineHeight: 1.5 };
const stepStyle: React.CSSProperties = { padding: "20px", listStyle: "none" };
const eyebrow: React.CSSProperties = { margin: "0 0 6px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" };

function StepTitle({ number, children }: { number: number; children: React.ReactNode }) {
  return <h2 style={{ display: "flex", alignItems: "center", gap: 10, margin: 0, fontSize: 17, lineHeight: 1.35, color: "var(--text)" }}>
    <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", flexShrink: 0, fontSize: 14 }}>{number}</span>
    {children}
  </h2>;
}

export default async function TryVerticalPage({ params }: { params: Promise<RouteParams> }) {
  const { vertical } = await params;
  if (!isVerticalId(vertical)) notFound();
  const t = VERTICAL_TEMPLATES[vertical];
  const pitch = VERTICAL_PITCH[vertical];
  const agentName = demoAgentName(vertical);
  const phone = DEMO_LINE_PHONE[vertical];
  const telHref = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : undefined;
  if (vertical === "roofing") {
    return <main style={{ minHeight: "100vh", background: "var(--background)", padding: "28px 20px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 560 }}>
        <header style={{ textAlign: "center", marginBottom: 22 }}>
          <h1 style={{ margin: "0 0 12px", fontSize: "1.65rem", lineHeight: 1.25, color: "var(--text)", fontWeight: 800 }}>24-Hour English &amp; Spanish Support for Your Customers</h1>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.5 }}>Automated leads, scheduling, reporting and invoicing for your office.</p>
          <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.5, color: "var(--text-muted)" }}>Crews speak their findings and materials into a phone. Updates go straight to the right job for you to see. No computer needed.</p>
          <p style={{ margin: 0, fontSize: 14 }}>So simple, you won&apos;t need training.</p>
        </header>
        <RoofingTrial />
        <section aria-label="Meet with Luxor" style={{ textAlign: "center", marginTop: 20 }}>
          <a className="button" href={liveDemoUrl()} style={{ minHeight: 48, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 18px", textDecoration: "none" }}><CalendarDays size={18} aria-hidden="true" />Schedule a Live Demo</a>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-muted)" }}>Choose a day and time to meet with Luxor.</p>
        </section>
        <details style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
          <summary style={{ cursor: "pointer", minHeight: 44, padding: "12px 8px", border: "1px solid var(--border)", borderRadius: 10 }}>Try the Shared Phone Line</summary>
          <p style={{ lineHeight: 1.5 }}>This separate phone demo uses a shared business name. Use Call and Book above to hear your own business name.</p>
          <a className="button" href={telHref} style={{ minHeight: 48, display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 18px", textDecoration: "none" }}><PhoneCall size={18} aria-hidden="true" />Call {phone}</a>
          <p>Explore a separate sample app with example bookings:</p>
          <EnterSandboxButton vertical="roofing" destination="bookings" label="Open Sample App" />
        </details>
        <p style={{ margin: "10px 0 0", textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}><a href="mailto:connect@luxordev.com" style={{ color: "var(--accent)" }}>connect@luxordev.com</a>{" · "}Luxor</p>
      </div>
    </main>;
  }
  const hasField = pitch.flow.includes("field") && !t.disabledModules.includes("jobs");

  return (
    <main style={{ minHeight: "100vh", background: "var(--background)", padding: "28px 16px 24px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <header style={{ marginBottom: 20 }}>
          <p style={{ ...eyebrow, color: "var(--accent)" }}>AI Receptionist · {t.label}</p>
          <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Try the demo</h1>
          <p style={{ ...muted, margin: 0 }}>Explore a {t.label.toLowerCase()} business in {hasField ? "three" : "two"} steps. No signup.</p>
        </header>

        <ol aria-label="Demo steps" style={{ display: "grid", gap: 12, margin: 0, padding: 0 }}>
          <li className="panel" style={stepStyle} data-testid="demo-step-call">
            <StepTitle number={1}>Call reception and make a booking</StepTitle>
            <p style={muted}>Ask for a service and a time.</p>
            <blockquote style={{ margin: "0 0 16px", padding: "10px 12px", borderLeft: "3px solid var(--accent)", background: "var(--surface-muted)", borderRadius: "0 8px 8px 0", fontSize: 14, lineHeight: 1.5, color: "var(--text)" }}>
              “{pitch.trySaying[0]}”
            </blockquote>
            {phone ? <>
              <p style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 800, color: "var(--text)", userSelect: "all" }}>{phone}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="button primary" style={{ minHeight: 44, padding: "12px 18px", display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
                  <PhoneCall size={17} strokeWidth={1.75} />Call {agentName}
                </a>
                <CopyPhoneButton phone={phone} />
              </div>
            </> : <>
              <p style={muted}>We’ll arrange a live call for your industry.</p>
              <a href={`mailto:connect@luxordev.com?subject=${encodeURIComponent(`Live ${t.label} AI demo`)}`} className="button primary" style={{ display: "inline-flex", minHeight: 44, padding: "12px 18px", alignItems: "center", textDecoration: "none" }}>Book a live call</a>
            </>}
          </li>

          <li className="panel" style={stepStyle} data-testid="demo-step-app">
            <StepTitle number={2}>See how bookings appear</StepTitle>
            <p style={muted}>Open the calendar with sample bookings already loaded.</p>
            <EnterSandboxButton vertical={vertical} destination="bookings" label="See the app →" />
            <p style={{ ...muted, margin: "10px 0 0", fontSize: 12 }}>Sample data, separate from your call. Viewing only.</p>
          </li>

          {hasField && <li className="panel" style={stepStyle} data-testid="demo-step-field">
            <StepTitle number={3}>{t.vocab.jobNoun === "Visit" ? "See a visit update" : "See a field update"}</StepTitle>
            <p style={muted}>A spoken note becomes organized {t.vocab.jobNoun.toLowerCase()} details.</p>
            <div style={{ background: "var(--surface-muted)", padding: "14px", borderRadius: 10, marginBottom: 14, color: "var(--text)" }} data-testid="field-update-example">
              <p style={eyebrow}>Crew says</p>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>“{t.vocab.voiceExample}”</p>
              <ArrowDown size={18} aria-hidden="true" style={{ margin: "10px 0", color: "var(--accent)" }} />
              <p style={eyebrow}>Office sees</p>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>Work, time and details saved to the {t.vocab.jobNoun.toLowerCase()}.</p>
            </div>
            <EnterSandboxButton vertical={vertical} destination="field" label={t.vocab.jobNoun === "Visit" ? "View visit updates →" : "View field updates →"} />
            <p style={{ ...muted, margin: "10px 0 0", fontSize: 12 }}>Explore the sample. Saving is turned off.</p>
          </li>}
        </ol>

        <footer style={{ marginTop: 20, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
          Questions? <a href="mailto:connect@luxordev.com" style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center", minHeight: 44 }}>connect@luxordev.com</a>
        </footer>
      </div>
    </main>
  );
}

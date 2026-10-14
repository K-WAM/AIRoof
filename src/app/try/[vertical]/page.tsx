// Public, static demo entry. Calls use the existing live demo line; the app
// opens a separate, per-industry sample business with the existing viewer role.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhoneCall, ArrowDown } from "lucide-react";
import { VERTICAL_TEMPLATES, DEMO_LINE_PHONE, demoAgentName, type VerticalId } from "@/lib/verticals/templates";
import { VERTICAL_PITCH } from "@/lib/verticals/pitch";
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
    const stepStyle: React.CSSProperties = { display: "flex", gap: 14, alignItems: "flex-start", padding: 20 };
    const numberStyle: React.CSSProperties = { width: 32, height: 32, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700 };
    const titleStyle: React.CSSProperties = { margin: "2px 0 12px", fontSize: 18, fontWeight: 700, color: "var(--text)" };

    return (
      <main style={{ minHeight: "100vh", background: "var(--background)", padding: "32px 20px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 520 }}>
          <h1 style={{ margin: "0 0 24px", textAlign: "center", fontSize: "1.75rem", lineHeight: 1.2, color: "var(--text)", fontWeight: 800 }}>Try it for yourself</h1>
          <ol aria-label="Try the demo" style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
            <li className="panel" style={stepStyle}>
              <span aria-hidden="true" style={numberStyle}>1</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 style={titleStyle}>Call and book</h2>
                <a href={telHref} className="button primary" aria-label={`Call the receptionist at ${phone}`} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, width: "100%", fontSize: 18, textDecoration: "none" }}>
                  <PhoneCall size={18} strokeWidth={1.75} aria-hidden="true" />{phone}
                </a>
                <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.5, color: "var(--text-muted)" }}>&ldquo;Can I book a roof inspection?&rdquo;</p>
              </div>
            </li>
            <li className="panel" style={stepStyle}>
              <span aria-hidden="true" style={numberStyle}>2</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <EnterSandboxButton vertical={vertical} label="See the App" destination="bookings" />
                <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--text-muted)" }}>Sample bookings · View only</p>
              </div>
            </li>
            <li className="panel" style={stepStyle}>
              <span aria-hidden="true" style={numberStyle}>3</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <EnterSandboxButton vertical={vertical} label="See voice updates" destination="field" />
                <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--text-muted)" }}>English or Spanish. Straight into the job.</p>
              </div>
            </li>
          </ol>
          <p style={{ margin: "16px 0 0", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>Your call appears in the guided demo.</p>
          <p style={{ margin: "10px 0 0", textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
            <a href="mailto:connect@luxordev.com" style={{ color: "var(--accent)" }}>connect@luxordev.com</a>{" · "}Luxor
          </p>
        </div>
      </main>
    );
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

// Public, no-login, self-led demo landing page — safe to text/email/QR to a
// prospect with zero intro from the owner. Fully static (generateStaticParams
// below pre-renders one page per vertical at build time; nothing here reads
// live Firestore state), so it's fast and has no auth surface to leak.
//
// Deliberately generic per vertical, not per-prospect: one reusable link/QR
// per industry rather than a unique URL per lead — simpler to hand out, and
// there's nothing prospect-specific to protect.
//
// Copy is deliberately terse (short bullets/labels, no paragraphs) — a
// tradesperson scanning this on a phone in the field isn't going to read
// prose. Two equal-weight entry points (call vs. software) rather than a
// forced "call first" sequence, since not every visitor wants both.
//
// Operational note (not shown on the page — this is for whoever sends the
// link): demo-roofing is the ONE shared live phone line: Vapi.dashboard-demoUrl
// reconfigures on every Demo Studio launch (see hub/demo/page.tsx). This page's
// phone number is only accurate while that line is currently launched as this
// vertical. Re-launch it in Demo Studio before sending this link out again if
// it may have been switched to demo a different industry in between.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhoneCall, Workflow, CalendarDays, Mic, Receipt, type LucideIcon } from "lucide-react";
import { VERTICAL_TEMPLATES, DEMO_LINE_PHONE, demoAgentName, type VerticalId } from "@/lib/verticals/templates";
import { CopyPhoneButton } from "./CopyPhoneButton";
import { EnterSandboxButton } from "./EnterSandboxButton";

type RouteParams = { vertical: string };

function isVerticalId(value: string): value is VerticalId {
  return Object.prototype.hasOwnProperty.call(VERTICAL_TEMPLATES, value);
}

export function generateStaticParams(): RouteParams[] {
  return Object.keys(VERTICAL_TEMPLATES).map((vertical) => ({ vertical }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { vertical } = await params;
  if (!isVerticalId(vertical)) return {};
  const t = VERTICAL_TEMPLATES[vertical];
  const agentName = demoAgentName(vertical);
  const title = `${t.label} AI Receptionist — Live Demo`;
  const description = `Call and talk to ${agentName}, the AI receptionist for ${t.label.toLowerCase()} businesses. No signup, no login — just call.`;
  return {
    title,
    description,
    openGraph: { title, description },
  };
}

const cardStyle: React.CSSProperties = { textAlign: "center", padding: "22px 20px" };
const labelStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

// Icon + label chip, no connecting arrows — arrows orphan awkwardly once this
// row wraps on a narrow phone screen (the common case: most visitors get here
// via a scanned QR code). Reading order alone conveys the sequence.
function FlowStep({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px 6px 6px",
        background: "var(--surface-muted)",
        borderRadius: 20,
      }}
    >
      <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent-soft)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon size={13} strokeWidth={1.75} style={{ color: "var(--accent)" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{label}</span>
    </div>
  );
}

export default async function TryVerticalPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { vertical } = await params;
  if (!isVerticalId(vertical)) notFound();

  const t = VERTICAL_TEMPLATES[vertical];
  const agentName = demoAgentName(vertical);
  const phone = DEMO_LINE_PHONE[vertical];
  const telHref = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : undefined;

  const tryLines = [
    `"I need a ${t.vocab.serviceTypePlaceholder.toLowerCase()}."`,
    t.approvedFaqs[0] ? `"${t.approvedFaqs[0].question}"` : null,
  ].filter((line): line is string => Boolean(line));

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--background)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 20px 36px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 600 }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--accent)",
            }}
          >
            AI Receptionist · {t.label}
          </p>
          <h1 style={{ margin: 0, fontSize: "1.7rem", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>
            Hear it. See it. Try it.
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            No login. No sales call. Just the real thing.
          </p>
        </div>

        {/* Two equal entry points */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {/* Call */}
          <div className="panel" style={cardStyle}>
            <p style={labelStyle}>Hear the AI</p>
            {phone && telHref ? (
              <>
                <p style={{ margin: "0 0 14px", fontSize: "1.55rem", fontWeight: 800, color: "var(--text)", userSelect: "all" }}>
                  {phone}
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  <a
                    href={telHref}
                    className="button primary"
                    style={{ fontSize: 14, padding: "11px 18px", display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
                  >
                    <PhoneCall size={15} strokeWidth={1.75} />
                    Call {agentName}
                  </a>
                  <CopyPhoneButton phone={phone} />
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-muted)" }}>Coming soon</p>
                <a
                  href="mailto:connect@luxordev.com?subject=Live%20demo%20request"
                  className="button primary"
                  style={{ fontSize: 14, padding: "11px 18px", textDecoration: "none" }}
                >
                  Request a demo
                </a>
              </>
            )}
          </div>

          {/* Software — only offered where the phone demo is also live, since
              both read the same shared demo-roofing business/data. */}
          {phone && (
            <div className="panel" style={cardStyle}>
              <p style={labelStyle}>See the Software</p>
              <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-muted)" }}>
                Real demo data loaded. No call needed.
              </p>
              <EnterSandboxButton />
            </div>
          )}
        </div>

        {/* How it works — one flow, whether you called or not */}
        {phone && (
          <div className="panel" style={{ marginTop: 14, padding: "18px 16px" }}>
            <p style={{ ...labelStyle, textAlign: "center" }}>How It Works</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <FlowStep icon={PhoneCall} label="Call" />
              <FlowStep icon={Workflow} label="Pipeline" />
              <FlowStep icon={CalendarDays} label="Calendar" />
              <FlowStep icon={Mic} label="Field" />
              <FlowStep icon={Receipt} label="Invoice" />
            </div>
            <p style={{ margin: "14px 0 0", fontSize: 11.5, color: "var(--text-muted)", textAlign: "center" }}>
              Skipped the call? Pipeline already has examples waiting.
            </p>
          </div>
        )}

        {/* Try saying */}
        <div className="panel" style={{ marginTop: 14, padding: "18px 20px" }}>
          <p style={labelStyle}>Try Saying</p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {tryLines.map((line) => (
              <li
                key={line}
                style={{
                  padding: "9px 12px",
                  background: "var(--surface-muted)",
                  borderRadius: 8,
                  fontSize: 13,
                  fontStyle: "italic",
                  color: "var(--text)",
                }}
              >
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "var(--text-muted)" }}>
          Questions? <a href="mailto:connect@luxordev.com" style={{ color: "var(--accent)" }}>connect@luxordev.com</a>
          {" · "}Powered by Luxor AI
        </p>
      </div>
    </div>
  );
}

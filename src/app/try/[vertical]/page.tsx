// Public, no-login, self-led demo landing page — safe to text/email/QR to a
// prospect with zero intro from the owner. Fully static (generateStaticParams
// below pre-renders one page per vertical at build time; nothing here reads
// live Firestore state), so it's fast and has no auth surface to leak.
//
// Deliberately generic per vertical, not per-prospect: one reusable link/QR
// per industry rather than a unique URL per lead — simpler to hand out, and
// there's nothing prospect-specific to protect.
//
// Operational note (not shown on the page — this is for whoever sends the
// link): demo-roofing is the ONE shared live phone line: Vapi.dashboard-demoUrl
// reconfigures on every Demo Studio launch (see hub/demo/page.tsx). This page's
// phone number is only accurate while that line is currently launched as this
// vertical. Re-launch it in Demo Studio before sending this link out again if
// it may have been switched to demo a different industry in between.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhoneCall } from "lucide-react";
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
    `"Hi, I'd like to schedule a ${t.vocab.serviceTypePlaceholder.toLowerCase()}."`,
    t.approvedFaqs[0] ? `"${t.approvedFaqs[0].question}"` : null,
    `"Or just describe what's going on — ${agentName} will take it from there."`,
  ].filter((line): line is string => Boolean(line));

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--background)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "56px 20px 40px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 560 }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <p
            style={{
              margin: "0 0 10px",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--accent)",
            }}
          >
            AI Receptionist · {t.label}
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: "1.9rem", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>
            See exactly what your customers will hear — and what your office sees
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: "var(--text-muted)", lineHeight: 1.6 }}>
            This is a live call to {agentName} — the same AI that would answer for your business. Then open the
            real dashboard and watch your call become a lead, a booked job, and a draft invoice, exactly like a
            real one would. No signup, no login, no waiting on hold.
          </p>
        </div>

        {/* Call CTA */}
        <div className="panel" style={{ textAlign: "center", padding: "32px 28px" }}>
          {phone && telHref ? (
            <>
              <p
                style={{
                  margin: "0 0 18px",
                  fontSize: "2rem",
                  fontWeight: 800,
                  letterSpacing: "0.01em",
                  color: "var(--text)",
                  userSelect: "all",
                }}
              >
                {phone}
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <a
                  href={telHref}
                  className="button primary"
                  style={{ fontSize: 15, padding: "13px 24px", display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}
                >
                  <PhoneCall size={17} strokeWidth={1.75} />
                  Call {agentName} now
                </a>
                <CopyPhoneButton phone={phone} />
              </div>
              <p style={{ margin: "16px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                On mobile, tap the button to dial straight from this page.
              </p>
            </>
          ) : (
            <>
              <p style={{ margin: "0 0 16px", fontSize: 15, color: "var(--text)", lineHeight: 1.6 }}>
                A live phone demo for {t.label.toLowerCase()} businesses is coming soon.
              </p>
              <a
                href="mailto:connect@luxordev.com?subject=Live%20demo%20request"
                className="button primary"
                style={{ fontSize: 15, padding: "13px 24px", textDecoration: "none" }}
              >
                Request a live walkthrough
              </a>
            </>
          )}
        </div>

        {/* Sandbox CTA — the real app, not a mockup. Only offered where the
            phone demo is also live, since both point at the same shared
            demo-roofing business/data. */}
        {phone && (
          <div className="panel" style={{ marginTop: 18, padding: "26px 28px", textAlign: "center" }}>
            <p
              style={{
                margin: "0 0 6px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
              }}
            >
              After your call
            </p>
            <p style={{ margin: "0 0 16px", fontSize: 15, color: "var(--text)", lineHeight: 1.6, maxWidth: 440, marginLeft: "auto", marginRight: "auto" }}>
              Your call doesn&apos;t just get answered — it becomes a lead in the Pipeline, a booked job on the
              Calendar, and a draft invoice with materials and labor filled in. This is the actual product your
              office would use, opened in a safe, read-only sandbox.
            </p>
            <EnterSandboxButton />
          </div>
        )}

        {/* Try saying */}
        <div className="panel" style={{ marginTop: 18, padding: "22px 26px" }}>
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            Try saying
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {tryLines.map((line) => (
              <li
                key={line}
                style={{
                  padding: "10px 14px",
                  background: "var(--surface-muted)",
                  borderRadius: 8,
                  fontSize: 14,
                  fontStyle: "italic",
                  color: "var(--text)",
                  lineHeight: 1.5,
                }}
              >
                {line}
              </li>
            ))}
          </ul>
        </div>

        {/* What you're seeing */}
        <div className="panel" style={{ marginTop: 18, padding: "22px 26px" }}>
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            What you&apos;re seeing
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8, fontSize: 14, color: "var(--text)", lineHeight: 1.55 }}>
            <li>{agentName} answers instantly, day or night — no hold music, no voicemail.</li>
            <li>Every call becomes a booked job or a follow-up lead automatically — nothing lands on a sticky note.</li>
            <li>Ask about hours, service area, or pricing — {agentName} is trained on real business rules, not a generic script.</li>
          </ul>
        </div>

        <p style={{ textAlign: "center", marginTop: 26, fontSize: 13, color: "var(--text-muted)" }}>
          Questions after your call?{" "}
          <a href="mailto:connect@luxordev.com" style={{ color: "var(--accent)" }}>
            connect@luxordev.com
          </a>
        </p>
        <p style={{ textAlign: "center", marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
          Powered by Luxor AI
        </p>
      </div>
    </div>
  );
}

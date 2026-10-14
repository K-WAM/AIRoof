"use client";

// The demo visitor's guide (/try/<industry> → "See it in the real app"). A prospect who has never seen the app gets the
// same story the /try page promised, as numbered steps across the top of every screen: where they are, one line on what
// to look at, and the next screen. Steps come from that industry's pitch (src/lib/verticals/pitch.ts), so a care home
// walks Calls → Pipeline → Calendar and is never sent to a Field tab it doesn't have.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBusinessModules, type CompanyModule } from "@/hooks/useBusinessModules";
import { VERTICAL_PITCH, type FlowStep } from "@/lib/verticals/pitch";

const STEP: Record<FlowStep, { path: string; module?: CompanyModule; label: (jobs: string) => string; tip: (jobs: string) => string }> = {
  call: { path: "/company/calls", label: () => "Calls", tip: () => "Every call the AI answered. Open one to read what it said." },
  pipeline: { path: "/company/pipeline", label: () => "Pipeline", tip: () => "What the AI captured from each caller — bookings to confirm, people to call back." },
  calendar: { path: "/company/calendar", label: () => "Calendar", tip: () => "Each booking sits with the person taking it." },
  field: { path: "/company/field", module: "jobs", label: () => "Field", tip: () => "Choose a sample job to read its field notes. Saving is turned off in this demo." },
  invoice: { path: "/company/jobs", module: "jobs", label: (jobs) => jobs, tip: (jobs) => `Open a finished one of your ${jobs.toLowerCase()} to see its invoice.` },
  paid: { path: "/company/billing", module: "billing", label: () => "Billing", tip: () => "What's owed and what's been paid." },
};

const linkStyle = { color: "#92400e", fontWeight: 700, textDecoration: "underline" } as const;

export function DemoTourBanner({ previewSuffix }: { previewSuffix: string }) {
  const pathname = usePathname() ?? "";
  const { industry, isEnabled, vocab } = useBusinessModules();
  const flow = (industry ? VERTICAL_PITCH[industry].flow : ["call", "pipeline", "calendar"] as FlowStep[])
    .filter((step, i, all) => all.findIndex((s) => STEP[s].path === STEP[step].path) === i) // one step per screen
    .filter((step) => !STEP[step].module || isEnabled(STEP[step].module));
  const at = flow.findIndex((step) => pathname.startsWith(STEP[step].path));
  const next = flow[at + 1];
  const jobs = vocab.jobNounPlural;
  if (flow.length === 0) return null;

  return (
    <div
      role="status"
      data-testid="demo-tour"
      style={{ margin: "0 0 16px", padding: "10px 16px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, fontSize: 13, color: "#92400e", display: "grid", gap: 6 }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px" }}>
        <strong>Demo tour <span style={{ fontWeight: 400 }}>· read-only</span></strong>
        <ol style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", margin: 0, padding: 0, listStyle: "none" }}>
          {flow.map((step, i) => (
            <li key={step}>
              <Link href={`${STEP[step].path}${previewSuffix}`} aria-current={i === at ? "step" : undefined}
                style={{ color: "#92400e", fontWeight: i === at ? 800 : 500, textDecoration: i === at ? "none" : "underline" }}>
                {i + 1}. {STEP[step].label(jobs)}
              </Link>
            </li>
          ))}
        </ol>
        <Link href={`/try/${industry ?? "roofing"}`} style={{ ...linkStyle, marginLeft: "auto" }}>Exit demo</Link>
      </div>
      <div>
        {at >= 0 ? (industry && VERTICAL_PITCH[industry].tourTip?.[flow[at]]) || STEP[flow[at]].tip(jobs) : "Sample data — sending and changes are turned off."}{" "}
        {at < 0 ? <Link href={`${STEP[flow[0]].path}${previewSuffix}`} style={linkStyle}>Start: {STEP[flow[0]].label(jobs)} →</Link>
          : next ? <Link href={`${STEP[next].path}${previewSuffix}`} style={linkStyle}>Next: {STEP[next].label(jobs)} →</Link>
          : <span>That&apos;s the tour — explore any tab.</span>}
      </div>
    </div>
  );
}

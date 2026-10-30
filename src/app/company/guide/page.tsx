"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { HelpCircle, Printer } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useBootstrap } from "@/contexts/BootstrapContext";
import { useBusinessModules, type CompanyModule } from "@/hooks/useBusinessModules";
import { FeedbackForm } from "@/components/ui/FeedbackForm";
import { defaultLandingPath } from "@/lib/team/landing";
import type { TeamRole, TradeTitle } from "@/types/team";
import { GUIDE_ROLES, guideFor, type GuideRole } from "./guideContent";

/**
 * The quick guide (owner, 2026-10-30): one short, printable page per role — Owner, Admin, Office staff, Foreman — in
 * the client's own branding, with an "Ask a question" button that reaches the Luxor team. Steps come from
 * guideContent.ts, which reads this industry's words and products, so a tab or button named here always exists.
 */
export default function GuidePage() {
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const sfx = preview ? `?preview=${preview}` : "";
  const { user } = useAuth();
  const business = useBootstrap().data?.business;
  const { isEnabled, vocab, calendarMode, disabledModules, quotes } = useBusinessModules();
  const [asking, setAsking] = useState(false);

  const roles = GUIDE_ROLES.filter((role) => role !== "foreman" || isEnabled("jobs"));
  const [picked, setPicked] = useState<GuideRole | null>(null);
  const role = picked && roles.includes(picked) ? picked : defaultRole(user, disabledModules, roles);
  const guide = guideFor(role, { isEnabled, vocab, calendarMode, quotes });
  const businessName = business?.businessName ?? "Your business";
  const href = (path: string) => `${path}${path.includes("?") ? sfx.replace("?", "&") : sfx}`;

  return (
    <div className="guide-page">
      <style>{PRINT_CSS}</style>
      <header className="guide-brand">
        {business?.logoUrl
          // eslint-disable-next-line @next/next/no-img-element -- a tenant data: URL or remote logo, not a build asset
          ? <img src={business.logoUrl} alt={`${businessName} logo`} className="guide-logo" />
          : <span className="guide-initial" aria-hidden="true" style={business?.brandColor ? { background: business.brandColor } : undefined}>{businessName.charAt(0)}</span>}
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{businessName}</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Quick guide · one page for each role</p>
        </div>
        <div className="guide-actions no-print">
          <button type="button" className="button secondary small" onClick={() => window.print()}><Printer size={14} /> Print</button>
          <button type="button" className="button primary small" onClick={() => setAsking(true)}><HelpCircle size={14} /> Ask a question</button>
        </div>
      </header>

      <div className="segmented-control no-print" role="tablist" aria-label="Guide for" style={{ marginBottom: 14 }}>
        {roles.map((r) => (
          <button key={r} type="button" role="tab" className="segment" aria-selected={r === role} onClick={() => setPicked(r)}>
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>

      <section className="panel guide-card" aria-label={`${ROLE_LABEL[role]} guide`}>
        <div className="panel-body">
          <p className="guide-eyebrow">{ROLE_LABEL[role]}</p>
          <h2 className="guide-title">{guide.title}</h2>
          <ol className="guide-steps">
            {guide.steps.map((step, index) => (
              <li key={step.action}>
                <span className="guide-number" aria-hidden="true">{index + 1}</span>
                <div>
                  <strong>{step.action}</strong>
                  <p>{step.detail}</p>
                </div>
                {step.path && <Link href={href(step.path)} className="button ghost small no-print">Open</Link>}
              </li>
            ))}
          </ol>
          <div className="guide-tips">
            <strong>Good to know</strong>
            <ul>{guide.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
          </div>
          <p className="guide-footer">Powered by Luxor CRM</p>
        </div>
      </section>

      <FeedbackForm open={asking} onClose={() => setAsking(false)} mode="question" />
    </div>
  );
}

const ROLE_LABEL: Record<GuideRole, string> = { owner: "Owner", admin: "Admin", staff: "Office staff", foreman: "Foreman" };

/** Open the page on the reader's own role: field people on Foreman, office logins on Office staff, Admins on Owner. */
function defaultRole(
  user: { role?: string; trade?: string; superadmin?: boolean } | null | undefined,
  disabledModules: CompanyModule[],
  roles: GuideRole[],
): GuideRole {
  if (!user || user.superadmin) return "owner";
  const lands = defaultLandingPath({ role: user.role as TeamRole, trade: user.trade as TradeTitle | undefined }, disabledModules);
  if (lands === "/company/field" && roles.includes("foreman")) return "foreman";
  if (user.role === "owner") return "owner";
  return "staff";
}

// One printed page: the guide card only, no app chrome, no buttons.
const PRINT_CSS = `
.guide-brand { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; flex-wrap: wrap; }
.guide-logo { height: 52px; max-width: 180px; object-fit: contain; }
.guide-initial { width: 52px; height: 52px; border-radius: 12px; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 24px; background: var(--accent); }
.guide-actions { margin-left: auto; display: flex; gap: 8px; }
.guide-card { max-width: 760px; }
.guide-eyebrow { margin: 0 0 2px; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--accent); }
.guide-title { margin: 0 0 14px; font-size: 20px; }
.guide-steps { list-style: none; margin: 0 0 16px; padding: 0; display: grid; gap: 12px; }
.guide-steps li { display: grid; grid-template-columns: 28px 1fr auto; gap: 12px; align-items: start; }
.guide-steps p { margin: 2px 0 0; color: var(--text-muted); font-size: 14px; line-height: 1.5; }
.guide-number { width: 28px; height: 28px; border-radius: 999px; background: var(--accent); color: #fff; font-size: 13px; font-weight: 700; display: grid; place-items: center; }
.guide-tips { padding: 12px 14px; border-radius: 10px; background: var(--accent-soft); font-size: 14px; }
.guide-tips ul { margin: 6px 0 0; padding-left: 18px; line-height: 1.55; }
.guide-footer { margin: 14px 0 0; font-size: 12px; color: var(--text-muted); }
@media print {
  .no-print, .company-topbar, .company-sidebar, .company-nav { display: none !important; }
  .company-shell { grid-template-columns: 1fr !important; }
  .company-main { padding: 0 !important; background: #fff !important; }
  body { background: #fff !important; }
  .guide-card { box-shadow: none; border: none; max-width: none; }
  .guide-page { padding: 24px; }
}
`;

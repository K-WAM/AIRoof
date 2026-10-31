import Link from "next/link";
import type { ReactNode } from "react";
import { COMPANY, LEGAL_PATHS, LEGAL_UPDATED } from "@/lib/legal/version";

// Public, no sign-in: carriers (10DLC review), prospects on /demo and new clients read these before an account exists.
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link href="/login" className="legal-brand">{COMPANY.product}</Link>
        <nav aria-label="Legal documents">
          <Link href={LEGAL_PATHS.terms}>Terms of Service</Link>
          <Link href={LEGAL_PATHS.privacy}>Privacy Policy</Link>
          <Link href={LEGAL_PATHS.sms}>Text Message Terms</Link>
        </nav>
      </header>
      <main className="legal-doc">{children}</main>
      <footer className="legal-footer">
        {COMPANY.legalName} · {COMPANY.state} · Last updated {LEGAL_UPDATED} · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
      </footer>
    </div>
  );
}

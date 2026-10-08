"use client";

// What a locked tab opens (owner, 2026-10-08): "the client should see the tabs for the rest, greyed out or locked …
// upgrade required, contact connect@luxordev.com". One screen per product: what it does, what they'd get, ONE button
// that tells Luxor (recorded on the client so the superadmin sees who asked) — and the email address as the fallback.

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Lock } from "lucide-react";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessModules, type CompanyModule } from "@/hooks/useBusinessModules";
import { useAuth } from "@/contexts/AuthContext";
import { productForModule } from "@/lib/products/products";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

const LUXOR_EMAIL = "connect@luxordev.com";
// Where an included product's tab lives, for "it's already in your plan — open it".
const HOME: Record<string, string> = { calls: "/company/calls", jobs: "/company/jobs", billing: "/company/billing" };

export default function UpgradePage() {
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const mod = (searchParams?.get("module") ?? "") as CompanyModule;
  const businessId = useBusinessId();
  const { user } = useAuth();
  const { ready, isEnabled } = useBusinessModules();
  const product = productForModule(mod);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const suffix = preview ? `?preview=${encodeURIComponent(preview)}` : "";

  if (!ready) return <PageSkeleton rows={3} />;
  if (!product) {
    return <p style={{ padding: 24 }}>Nothing to add here. <Link href={`/company/dashboard${suffix}`}>Back to the dashboard</Link></p>;
  }
  const included = isEnabled(mod);
  const isOwner = user?.role === "owner" || !!user?.superadmin;
  const mailto = `mailto:${LUXOR_EMAIL}?subject=${encodeURIComponent(`Add ${product.label} to our plan`)}`;

  async function ask() {
    setState("sending");
    try {
      const res = await fetch("/api/company/upgrade-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, product: product!.id }),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div style={{ maxWidth: 620 }}>
      <header className="page-header">
        <div>
          <p className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
            {included ? <CheckCircle2 size={13} strokeWidth={2} /> : <Lock size={13} strokeWidth={2} />}
            {included ? "In your plan" : "Not in your plan"}
          </p>
          <h1 className="page-title">{product.label}</h1>
          <p className="page-subtitle">{product.pitch}</p>
        </div>
      </header>

      <section className="panel" data-testid="upgrade-panel">
        <div className="panel-body">
          <ul style={{ listStyle: "none", margin: "0 0 18px", padding: 0, display: "grid", gap: 10 }}>
            {product.gets.map((line) => (
              <li key={line} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 15 }}>
                <CheckCircle2 size={18} strokeWidth={1.75} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />{line}
              </li>
            ))}
          </ul>

          {included ? (
            <Link className="button primary" href={`${HOME[mod]}${suffix}`}>Open {product.label}</Link>
          ) : user?.superadmin ? (
            <p style={{ margin: 0 }}>You&apos;re previewing this client. Turn it on in <Link href={`/admin/businesses/${businessId}/config#products`}>their Products</Link>.</p>
          ) : state === "sent" ? (
            <p role="status" data-testid="upgrade-sent" style={{ margin: 0, color: "#15803d", fontWeight: 600 }}>
              Thanks — Luxor has your request and will reach out within one business day.
            </p>
          ) : (
            <>
              <button type="button" className="button primary" disabled={state === "sending"} onClick={() => void ask()} data-testid="upgrade-ask">
                {state === "sending" ? "Sending…" : "Ask Luxor to add it"}
              </button>
              {state === "error" && <p role="alert" style={{ margin: "10px 0 0", color: "#b91c1c" }}>That didn&apos;t send. Email us instead.</p>}
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                {isOwner ? "Or email " : "Your account owner decides what's in the plan — or email "}
                <a href={mailto}>{LUXOR_EMAIL}</a>.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

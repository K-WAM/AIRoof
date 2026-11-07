"use client";
import { useEffect, useState } from "react";
import type { PublicOnboardingView } from "@/types/onboarding";
import { PortalView } from "@/components/onboarding/PortalView";
import s from "@/components/onboarding/onboarding.module.css";
export default function OnboardingPage() {
  const [view, setView] = useState<PublicOnboardingView>(); const [error, setError] = useState("");
  useEffect(() => { let active = true; fetch("/api/onboarding", { cache: "no-store" }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); if (active) setView(data); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  if (error) return <main className={`${s.root} ${s.page} ${s.narrow}`}><p>with Luxor</p><h1>Your onboarding portal</h1><p role="alert">{error}</p><a className="button" href="mailto:connect@luxordev.com">Ask Luxor for a new link</a></main>;
  return <main>{view ? <PortalView view={view} /> : <p className={s.page} role="status">Loading your portal…</p>}</main>;
}

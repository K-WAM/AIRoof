"use client";
import { useEffect, useState } from "react";
import type { OnboardingPortal } from "@/types/onboarding";
import s from "./onboarding.module.css";
export function OnboardingStrip({ businessId }: { businessId: string }) {
  const [portal, setPortal] = useState<OnboardingPortal | null>();
  useEffect(() => { let active = true; fetch(`/api/admin/businesses/${encodeURIComponent(businessId)}/onboarding?summary=1`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => { if (active) setPortal(data?.portal ?? null); }).catch(() => { if (active) setPortal(null); }); return () => { active = false; }; }, [businessId]);
  const review = portal ? Object.values(portal.forms).filter(f => f.status === "submitted").length : 0;
  return <div className={`${s.root} ${s.strip} ${s.row}`}><span>{portal ? `Onboarding: ${portal.steps.filter(s => s.status === "done").length} of ${portal.steps.length} steps · ${portal.checklist.filter(i => i.status === "received").length} of ${portal.checklist.length} items received · ${review} form${review === 1 ? "" : "s"} to review` : "Onboarding"}</span><a className="button" href={`/admin/businesses/${encodeURIComponent(businessId)}/onboarding`}>{portal ? "Open onboarding" : "Start onboarding"}</a></div>;
}

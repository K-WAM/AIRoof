/* eslint-disable @next/next/no-img-element */
"use client";
import { use, useEffect, useState } from "react";
import { OnboardingForm, type FormPayload } from "@/components/onboarding/OnboardingForm";
import s from "@/components/onboarding/onboarding.module.css";
export default function ClientFormPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = use(params); const [payload, setPayload] = useState<FormPayload>(); const [error, setError] = useState("");
  useEffect(() => { let active = true; fetch(`/api/onboarding/forms/${encodeURIComponent(formId)}`, { cache: "no-store" }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); if (active) setPayload(data); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [formId]);
  return <main className={`${s.root} ${s.page} ${s.narrow}`}><header className={s.header}><a className="button" href="/onboarding">← Your portal</a><span className={s.muted}>with <img className={s.luxor} src="/luxor-mark.png" alt="Luxor" /></span></header>{error ? <div role="alert"><h1>Your onboarding form</h1><p>{error}</p><a href="mailto:connect@luxordev.com">Contact Luxor</a></div> : payload ? <OnboardingForm key={formId} payload={payload} /> : <p role="status">Loading your form…</p>}</main>;
}

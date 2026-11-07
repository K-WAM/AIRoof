/* eslint-disable @next/next/no-img-element -- supplied client data URIs and logos keep their natural proportions. */
import type { PublicOnboardingView } from "@/types/onboarding";
import { ProgressTracker } from "./ProgressTracker";
import { DataReview } from "./DataReview";
import s from "./onboarding.module.css";
export const FORM_STATUS = { not_sent: "Not sent", sent: "Sent", in_progress: "Opened", submitted: "Submitted", reviewed: "Reviewed" };
export const CHECKLIST_STATUS = { received: "Received", partial: "Partly received", waiting: "Waiting", not_needed: "Not needed" };
export function PortalView({ view }: { view: PublicOnboardingView }) {
  const next = view.forms.find(f => f.status !== "submitted" && f.status !== "reviewed")?.id;
  const email = view.settings.contactEmail || "connect@luxordev.com";
  return <div className={`${s.root} ${s.page}`}>
    <header className={s.header}>{view.logoUrl ? <img className={s.logo} src={view.logoUrl} alt={view.clientName} /> : <strong>{view.clientName}</strong>}<span className={s.muted}>with <img className={s.luxor} src="/luxor-mark.png" alt="Luxor" /></span></header>
    <h1>Welcome, {view.clientName}</h1><p className={s.muted}>Your setup, one step at a time. Check what is ready and share what we still need.</p>
    <ProgressTracker steps={view.steps} nextMeetingLabel={view.settings.nextMeetingLabel} />
    <section className={s.section}><h2>Your forms</h2><div className={s.grid}>{view.forms.map(form => <article className={`${s.card} ${form.id === next ? s.next : ""}`} key={form.id}>
      <h3>{form.title}</h3><p>{form.summary}</p><div className={s.row}><span className={s.muted}>{form.minutes ? `About ${form.minutes} minutes` : "Read at your pace"}</span><span className={s.pill}>{FORM_STATUS[form.status]}</span></div>
      <a className={`button ${form.id === next ? "primary" : ""}`} style={{ marginTop: 16 }} href={`/onboarding/forms/${form.id}`}>{form.status === "submitted" || form.status === "reviewed" ? "View answers" : form.status === "in_progress" ? "Continue" : "Start"}</a>
    </article>)}</div></section>
    <section className={s.section}><h2>What we still need</h2><div className={s.grid}>{[...new Set(view.checklist.map(i => i.group))].map(group => <article className={s.card} key={group}><h3>{group}</h3>{view.checklist.filter(i => i.group === group).map(item => <div className={s.item} key={item.id}>
      <div className={s.row}><strong>{item.title}</strong><span className={`${s.pill} ${item.status === "received" ? s.received : item.status === "partial" ? s.partial : ""}`}>{CHECKLIST_STATUS[item.status]}</span></div>
      {item.detail && <p className={s.muted}>{item.detail}</p>}
      {item.formId && <a className="button" href={`/onboarding/forms/${item.formId}`}>Open form</a>}
      {item.sendByEmail && <p><a href={`mailto:${email}`}>Email it to {email}</a></p>}
    </div>)}</article>)}</div></section>
    <DataReview review={view.dataReview} />
    <footer className={s.footer}>Questions? <a href={`mailto:${email}`}>Contact {view.settings.contactName || "Luxor"}</a></footer>
  </div>;
}

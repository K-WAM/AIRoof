"use client";
import { useEffect, useRef, useState } from "react";
import type { OnboardingAnswers, OnboardingField, OnboardingFormDefinition, OnboardingOption, OnboardingPersonRow } from "@/types/onboarding";
import { fieldVisible, initialAnswers, optionsFor, YOUR_NAME, type Prefill } from "@/lib/onboarding/validate";
import { PEOPLE_ROLE_OPTIONS } from "@/lib/onboarding/forms";
import s from "./onboarding.module.css";

export interface FormPayload { definition: OnboardingFormDefinition; prefill: Prefill; answers?: OnboardingAnswers; state?: "draft" | "submitted"; revision?: number }
function Choices({ field, value, options, onChange }: { field: OnboardingField; value: unknown; options: OnboardingOption[]; onChange: (v: unknown) => void }) {
  return <div className={s.choices}>{options.map(o => <label className={s.choice} key={o.value}><input type={field.type === "radio" ? "radio" : "checkbox"} name={field.id} checked={field.type === "radio" ? value === o.value : Array.isArray(value) && value.includes(o.value)} onChange={e => onChange(field.type === "radio" ? o.value : e.target.checked ? [...(Array.isArray(value) ? value : []), o.value] : (Array.isArray(value) ? value : []).filter(v => v !== o.value))} />{o.label}</label>)}</div>;
}
function People({ field, value, prefill, onChange }: { field: OnboardingField; value: unknown; prefill: Prefill; onChange: (v: unknown) => void }) {
  const rows = (Array.isArray(value) ? value : []) as OnboardingPersonRow[];
  const crews = (prefill["crews.options"] ?? []) as OnboardingOption[];
  const change = (index: number, key: string, v: string) => onChange(rows.map((row, i) => i === index ? { ...row, [key]: v } : row));
  const textCell = (row: OnboardingPersonRow, i: number, key: "name" | "position" | "email" | "mobile", label: string, max: number) => <td><label><span>{label}</span><input aria-label={`${label}, person ${i + 1}`} type={key === "email" ? "email" : key === "mobile" ? "tel" : "text"} value={row[key] ?? ""} maxLength={max} onChange={e => change(i, key, e.target.value)} /></label>{key === "name" && row.prefilled && <small className={s.muted}>From your current system</small>}</td>;
  return <><div className={s.people}><table className={s.peopleTable} aria-label="People"><thead><tr>{["Name", "Job title", "App access", "Work email", "Mobile", "Language", "Crew", "Actions"].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} aria-label={`Person ${i + 1}`}>
    {textCell(row, i, "name", "Name", 100)}
    {textCell(row, i, "position", "Job title", 100)}
    <td><label><span>App access</span><select aria-label={`App access, person ${i + 1}`} value={row.appRole ?? ""} onChange={e => change(i, "appRole", e.target.value)}><option value="">Choose access</option>{PEOPLE_ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label></td>
    {textCell(row, i, "email", "Work email", 200)}
    {textCell(row, i, "mobile", "Mobile", 40)}
    <td><label><span>Language</span><select aria-label={`Language, person ${i + 1}`} value={row.language ?? ""} onChange={e => { const language = e.target.value; onChange(rows.map((r, index) => { if (index !== i) return r; const { language: _old, ...rest } = r; return language ? { ...rest, language } : rest; })); }}><option value="">Choose language</option><option value="en">English</option><option value="es">Spanish</option><option value="both">English and Spanish</option></select></label></td>
    <td><label><span>Crew</span><select aria-label={`Crew, person ${i + 1}`} value={row.crewId ?? ""} onChange={e => change(i, "crewId", e.target.value)}><option value="">No crew</option>{crews.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label></td>
    <td><button className="button" type="button" aria-label={`Remove person ${i + 1}`} onClick={() => onChange(rows.filter((_, index) => index !== i))}>Remove</button></td>
  </tr>)}</tbody></table></div><button type="button" className="button" disabled={rows.length >= (field.max ?? 80)} onClick={() => onChange([...rows, { name: "", appRole: "none" }])}>Add person</button></>;
}
function Field({ field: f, value, prefill, error, onChange }: { field: OnboardingField; value: unknown; prefill: Prefill; error?: string; onChange: (v: unknown) => void }) {
  const id = `onb-${f.id}`; const options = optionsFor(f, prefill);
  let control: React.ReactNode;
  const props = { id, "aria-describedby": `${id}-help ${id}-error`, "aria-invalid": !!error };
  if (f.type === "people") control = <People field={f} value={value} prefill={prefill} onChange={onChange} />;
  else if (f.type === "matrix") {
    const matrix = (value ?? {}) as Record<string, string[]>;
    control = <div className={s.stack}>{f.rows?.map(row => <div key={row.value}><strong>{row.label}</strong><div className={s.choices}>{options.map(o => <button className="button" type="button" key={o.value} aria-pressed={(matrix[row.value] ?? []).includes(o.value)} style={(matrix[row.value] ?? []).includes(o.value) ? { background: "var(--accent-soft)", borderColor: "var(--accent)" } : {}} onClick={() => onChange({ ...matrix, [row.value]: (matrix[row.value] ?? []).includes(o.value) ? matrix[row.value].filter(v => v !== o.value) : [...(matrix[row.value] ?? []), o.value] })}>{o.label}</button>)}</div></div>)}</div>;
  } else if (f.type === "address") {
    const address = (value ?? {}) as Record<string, string>;
    control = <div className={s.grid}>{([ ["street", "Street address", 200], ["city", "City", 100], ["state", "State", 2], ["zip", "ZIP code", 10] ] as const).map(([key, label, max]) => <label key={key}>{label}<input aria-label={`${f.label}: ${label}`} autoComplete={key === "street" ? "street-address" : key === "city" ? "address-level2" : key === "state" ? "address-level1" : "postal-code"} value={address[key] ?? ""} maxLength={max} onChange={e => onChange({ street: "", city: "", state: "", zip: "", ...address, [key]: e.target.value })} /></label>)}</div>;
  } else if (f.type === "checkboxes" || f.type === "radio") control = <Choices field={f} value={value} options={options} onChange={onChange} />;
  else if (f.type === "checkbox") control = <label className={s.choice}><input {...props} type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} />{f.label}</label>;
  else if (f.type === "select") control = <select {...props} value={String(value ?? "")} onChange={e => onChange(e.target.value)}><option value="">Choose an option</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  else if (f.type === "textarea") control = <textarea {...props} value={String(value ?? "")} maxLength={f.max ?? 2000} placeholder={f.placeholder} onChange={e => onChange(e.target.value)} />;
  else control = <input {...props} type={f.type === "number" || f.type === "money" ? "number" : f.type === "email" || f.type === "tel" ? f.type : "text"} inputMode={f.type === "ein" ? "text" : f.type === "money" ? "numeric" : undefined} min={f.type === "number" || f.type === "money" ? 0 : undefined} step={f.type === "money" ? 1 : undefined} value={String(value ?? "")} maxLength={f.max ?? 200} placeholder={f.placeholder} onChange={e => onChange((f.type === "number" || f.type === "money") && e.target.value !== "" ? Number(e.target.value) : e.target.value)} />;
  return <div className={s.field} role="group" aria-labelledby={`${id}-label`}><label id={`${id}-label`} className={s.fieldLabel} htmlFor={id}>{f.type !== "checkbox" && <>{f.label}{f.required ? " *" : ""}</>}</label>{control}<small id={`${id}-help`} className={s.muted}>{f.type === "ein" ? "Only the last 4 digits are shown after you save." : f.help}</small>{error && <span id={`${id}-error`} className={s.error} role="alert">{error}</span>}</div>;
}
export function OnboardingForm({ payload, readOnly = false }: { payload: FormPayload; readOnly?: boolean }) {
  const { definition: def, prefill } = payload;
  const [answers, setAnswers] = useState(() => initialAnswers(def, prefill, payload.answers));
  const values = useRef(answers); const revision = useRef(payload.revision ?? 0);
  const [changed, setChanged] = useState(0); const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [thanks, setThanks] = useState(false);
  const [conflict, setConflict] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; clearTimeout(timer.current); }; }, []);
  useEffect(() => {
    if (!changed || message === "Saved" || readOnly || thanks) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed, message, readOnly, thanks]);
  const change = (key: string, value: unknown) => { values.current = { ...values.current, [key]: value }; setAnswers(values.current); setChanged(n => n + 1); setMessage("Unsaved changes"); setErrors(old => ({ ...old, [key]: "" })); };
  const save = useRef<(submit: boolean) => Promise<void>>(async () => {});
  save.current = async (submit: boolean) => {
    if (readOnly || conflict) return;
    const snapshot = values.current;
    try {
      setMessage(submit ? "Sending…" : "Saving…");
      const response = await fetch(`/api/onboarding/forms/${def.id}${submit ? "/submit" : ""}`, { method: submit ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: snapshot, revision: revision.current }) });
      const data = await response.json();
      if (!mounted.current) return;
      if (!response.ok) { setErrors(data.errors ?? {}); setMessage(data.error || "We couldn't save. Try again."); if (response.status === 409) setConflict(true); return; }
      revision.current = data.revision;
      // Only replace unchanged fields; typing while a request runs must never be discarded.
      const editedDuringSave = values.current !== snapshot;
      const next = { ...values.current };
      for (const [key, value] of Object.entries(data.answers as OnboardingAnswers)) if (JSON.stringify(values.current[key]) === JSON.stringify(snapshot[key])) next[key] = value;
      values.current = next; setAnswers(next); setErrors({}); setMessage(editedDuringSave ? "Unsaved changes" : "Saved");
      if (submit) setThanks(true);
    } catch { if (mounted.current) setMessage("Your changes haven't saved. Check your connection and try again."); }
  };
  useEffect(() => {
    if (!changed || readOnly || conflict) return;
    timer.current = setTimeout(() => { pending.current = pending.current.then(() => save.current(false)); }, 1500);
    return () => clearTimeout(timer.current);
  }, [changed, readOnly, conflict]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || conflict) return;
    clearTimeout(timer.current); setBusy(true);
    await pending.current; await save.current(true); setBusy(false);
  }
  if (thanks) return <section className={s.card}><h1>Thank you</h1><p>{def.thankYou}</p><a className="button primary" href="/onboarding">Back to your portal</a></section>;
  return <form onSubmit={submit} noValidate>
    <h1>{def.title}</h1><p>{def.intro}</p>
    {payload.state === "submitted" && !readOnly && <p className={s.strip}>Your answers were sent. You can correct them here and send them again.</p>}
    {def.info?.map((block, i) => <section className={`${s.card} ${s.section}`} key={i}>{block.title && <h2>{block.title}</h2>}{block.text && <p>{block.text}</p>}{block.items && (block.kind === "steps" ? <ol>{block.items.map(t => <li key={t}>{t}</li>)}</ol> : <ul>{block.items.map(t => <li key={t}>{t}</li>)}</ul>)}{block.links?.map(l => <p key={l.href}><a href={l.href} target="_blank" rel="noopener noreferrer">{l.label}</a></p>)}</section>)}
    <fieldset disabled={readOnly || busy || conflict} style={{ border: 0, margin: 0, padding: 0 }}>
      {def.sections.map(section => <section className={`${s.card} ${s.section}`} key={section.id}><h2>{section.title}</h2>{section.intro && <p className={s.muted}>{section.intro}</p>}{section.fields.filter(f => fieldVisible(f, answers, prefill)).map(f => <Field key={f.id} field={f} value={answers[f.id]} prefill={prefill} error={errors[f.id]} onChange={v => change(f.id, v)} />)}</section>)}
      {def.sections.length > 0 && <section className={s.section}><Field field={YOUR_NAME} value={answers.submittedBy} prefill={prefill} error={errors.submittedBy} onChange={v => change("submittedBy", v)} /></section>}
    </fieldset>
    <section className={`${s.trust} ${s.section}`}><h2>How we use this information</h2>{def.dataUse.map(t => <p key={t}>{t}</p>)}<div className={s.actions}>{def.dataUseLinks?.map(l => <a href={l.href} key={l.href} target="_blank" rel="noopener noreferrer">{l.label}</a>)}</div></section>
    {errors.form && <p role="alert" className={s.error}>{errors.form}</p>}
    <p role="status" className={s.muted}>{message}</p>
    {conflict && <button className="button" type="button" onClick={() => window.location.reload()}>Reload latest answers</button>}
    {!readOnly && def.sections.length > 0 ? <div className={s.sticky}><button className="button primary" type="submit" disabled={busy || conflict}>{busy ? "Sending…" : def.submitLabel}</button>{message.includes("haven't saved") && <button className="button" type="button" onClick={() => { pending.current = pending.current.then(() => save.current(false)); }}>Try saving again</button>}</div> : !readOnly && <a className="button" href="/onboarding">Back to your portal</a>}
  </form>;
}

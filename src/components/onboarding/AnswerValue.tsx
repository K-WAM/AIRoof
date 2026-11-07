import type { OnboardingField, OnboardingOption, OnboardingPersonRow } from "@/types/onboarding";
import { PEOPLE_ROLE_OPTIONS } from "@/lib/onboarding/forms";
import { optionsFor, type Prefill } from "@/lib/onboarding/validate";
import s from "./onboarding.module.css";

export function AnswerValue({ value, field, prefill }: { value: unknown; field: OnboardingField; prefill: Prefill }) {
  if (value === undefined || value === "" || value === null || (Array.isArray(value) && !value.length)) return <span className={s.muted}>Not answered</span>;
  const optionLabel = (v: string, options = optionsFor(field, prefill)) => options.find(o => o.value === v)?.label ?? v;
  if (field.type === "people" && Array.isArray(value)) {
    const crews = (prefill["crews.options"] ?? []) as OnboardingOption[];
    const language = { en: "English", es: "Spanish", both: "English and Spanish" };
    return <div className={s.stack}>{(value as OnboardingPersonRow[]).map((person, i) => <div className={s.card} key={i}>
      <strong>{person.name}</strong>
      {person.position && <p>Job title: {person.position}</p>}
      {person.appRole && <p>App access: {optionLabel(person.appRole, PEOPLE_ROLE_OPTIONS)}</p>}
      {person.email && <p>Work email: {person.email}</p>}
      {person.mobile && <p>Mobile: {person.mobile}</p>}
      {person.language && <p>Language: {language[person.language]}</p>}
      {person.crewId && <p>Crew: {optionLabel(person.crewId, crews)}</p>}
    </div>)}</div>;
  }
  if (Array.isArray(value)) return <ul>{value.map((v, i) => <li key={i}>{optionLabel(String(v))}</li>)}</ul>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (typeof value === "object") {
    const addressLabels: Record<string, string> = { street: "Street address", city: "City", state: "State", zip: "ZIP code" };
    return <dl>{Object.entries(value).map(([key, val]) => <div key={key}>
      <dt>{field.rows?.find(r => r.value === key)?.label ?? addressLabels[key] ?? key}</dt>
      <dd>{Array.isArray(val) ? val.map(v => optionLabel(String(v))).join(", ") || "Not answered" : String(val) || "Not answered"}</dd>
    </div>)}</dl>;
  }
  return <span>{optionLabel(String(value))}</span>;
}

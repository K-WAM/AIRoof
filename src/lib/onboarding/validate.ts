import { z } from "zod";
import type { OnboardingAnswers, OnboardingField, OnboardingFormDefinition, OnboardingOption } from "@/types/onboarding";
import { PEOPLE_ROLE_OPTIONS } from "./forms";
import { keepSavedEin } from "./mask";

export type Prefill = Record<string, unknown>;
export const YOUR_NAME: OnboardingField = { id: "submittedBy", type: "text", label: "Your name", required: true, max: 100 };
export function optionsFor(field: OnboardingField, prefill: Prefill): OnboardingOption[] {
  return field.optionsFrom ? (prefill[field.optionsFrom] as OnboardingOption[] | undefined) ?? [] : field.options ?? [];
}
export function fieldVisible(field: OnboardingField, answers: OnboardingAnswers, prefill: Prefill): boolean {
  if (field.optionsFrom && optionsFor(field, prefill).length < 2) return false;
  if (!field.showIf) return true;
  const value = answers[field.showIf.field];
  return Array.isArray(value) ? value.includes(field.showIf.equals) : value === field.showIf.equals;
}
export function initialAnswers(def: OnboardingFormDefinition, prefill: Prefill, saved: OnboardingAnswers = {}): OnboardingAnswers {
  const answers: OnboardingAnswers = {};
  for (const f of def.sections.flatMap(s => s.fields)) {
    const value = f.prefill ? prefill[f.prefill] : undefined;
    if (value !== undefined) answers[f.id] = value;
    else if (f.defaultValue !== undefined) answers[f.id] = f.defaultValue;
    if (f.optionsFrom && optionsFor(f, prefill).length === 1) answers[f.id] = f.type === "checkboxes" ? [optionsFor(f, prefill)[0].value] : optionsFor(f, prefill)[0].value;
  }
  return { ...answers, ...saved };
}
const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
function phone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  throw new Error("Enter a US phone number with 10 digits.");
}
function text(value: unknown, max: number) { return z.string().max(max).parse(value).trim(); }
function choice(value: unknown, options: OnboardingOption[]) {
  if (typeof value !== "string" || !options.some(o => o.value === value)) throw new Error("Choose one of the listed options.");
  return value;
}
function parseField(f: OnboardingField, value: unknown, prefill: Prefill, mode: "draft" | "submit"): unknown {
  const max = f.max ?? (f.type === "textarea" ? 2000 : 200);
  switch (f.type) {
    case "checkbox": return z.boolean().parse(value);
    case "number": case "money": {
      const n = z.number().finite().min(0).parse(value);
      if (f.type === "money" && !Number.isInteger(n)) throw new Error("Enter whole dollars.");
      return n;
    }
    case "email": return z.string().max(max).email().parse(value).trim();
    case "tel": return phone(text(value, max));
    case "ein": {
      const s = text(value, 20).replace(/[- ]/g, "");
      if (!/^\d{9}$/.test(s)) throw new Error("Enter all 9 digits of the EIN.");
      return `${s.slice(0, 2)}-${s.slice(2)}`;
    }
    case "url": {
      const s = text(value, max);
      const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(s) ? s : `https://${s}`);
      if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password) throw new Error("Enter a secure website address starting with https://.");
      if (url.href.length > max) throw new Error(`Keep the website address under ${max + 1} characters.`);
      return url.href;
    }
    case "select": case "radio": return choice(value, optionsFor(f, prefill));
    case "checkboxes": return [...new Set(z.array(z.string()).max(optionsFor(f, prefill).length).parse(value).map(v => choice(v, optionsFor(f, prefill))))];
    case "address": {
      const a = z.object({ street: z.string().max(200), city: z.string().max(100), state: z.string().max(2), zip: z.string().max(10) }).strict().parse(value);
      a.state = a.state.toUpperCase();
      if (a.state && !/^[A-Z]{2}$/.test(a.state)) throw new Error("Use the two-letter state abbreviation.");
      if (a.zip && !/^\d{5}(-\d{4})?$/.test(a.zip)) throw new Error("Enter a 5-digit ZIP code, or ZIP+4.");
      if (mode === "submit" && f.required && Object.values(a).some(v => !v.trim())) throw new Error("Complete the street, city, state and ZIP code.");
      return a;
    }
    case "matrix": {
      const object = z.record(z.string(), z.array(z.string()).max(f.options?.length ?? 0)).parse(value);
      for (const [key, choices] of Object.entries(object)) {
        if (!f.rows?.some(r => r.value === key)) throw new Error("Choose from the listed questions.");
        choices.forEach(v => choice(v, f.options ?? []));
      }
      return object;
    }
    case "people": {
      const rows = z.array(z.object({ name: z.string().min(1).max(100), position: z.string().max(100).optional(), appRole: z.string().max(40).optional(), email: z.string().max(200).optional(), mobile: z.string().max(40).optional(), language: z.enum(["en", "es", "both"]).optional(), crewId: z.string().max(100).optional(), prefilled: z.boolean().optional() }).strict()).max(f.max ?? 80).parse(value);
      return rows.map(r => {
        if (!r.name.trim()) throw new Error("Enter a name for each person, or remove the empty row.");
        if (r.email) z.string().email().parse(r.email);
        if (r.appRole) choice(r.appRole, PEOPLE_ROLE_OPTIONS);
        // A crew that was deleted or switched off since (prefill, or an older draft) is cleared, never an error: the client
        // can't see why the row fails, because the menu shows "No crew" for a value it no longer lists.
        const crews = (prefill["crews.options"] as OnboardingOption[]) ?? [];
        const crewId = r.crewId && crews.some(o => o.value === r.crewId) ? r.crewId : "";
        return { ...r, crewId, name: r.name.trim(), ...(r.mobile ? { mobile: phone(r.mobile) } : {}) };
      });
    }
    default: return text(value, max);
  }
}
export function validateAnswers(def: OnboardingFormDefinition, input: unknown, mode: "draft" | "submit", prefill: Prefill = {}, saved: OnboardingAnswers = {}) {
  const errors: Record<string, string> = {};
  const parsed = z.record(z.string(), z.unknown()).safeParse(input);
  if (!parsed.success) return { answers: {}, errors: { form: "Enter your answers in the form." }, valid: false };
  const source = parsed.data;
  const answers: OnboardingAnswers = {};
  const fields = [...def.sections.flatMap(s => s.fields), YOUR_NAME];
  if (Object.keys(source).some(key => !fields.some(f => f.id === key))) errors.form = "This form has changed. Reload before saving.";
  for (const f of fields) {
    const visible = fieldVisible(f, source, prefill);
    let value = source[f.id];
    if (f.type === "ein") value = keepSavedEin(value, saved[f.id]);
    if (empty(value)) {
      if (visible && mode === "submit" && f.required) errors[f.id] = `Enter ${f.label.toLowerCase()}.`;
      if (value !== undefined && (value === "" || Array.isArray(value))) answers[f.id] = value;
      continue;
    }
    try {
      // Validate the shape and caps of hidden values too; required applies only to visible fields.
      answers[f.id] = parseField(f, value, prefill, visible ? mode : "draft");
      if (visible && mode === "submit" && f.required && typeof answers[f.id] === "string" && !String(answers[f.id]).trim()) errors[f.id] = `Enter ${f.label.toLowerCase()}.`;
      if (visible && mode === "submit" && f.required && f.type === "checkbox" && value !== true) errors[f.id] = "Tick this box to confirm before sending.";
    } catch (error) {
      errors[f.id] = error instanceof Error && !(error instanceof z.ZodError) && !(error instanceof TypeError) ? error.message : `Check ${f.label.toLowerCase()} and its length.`;
    }
  }
  return { answers, errors, valid: Object.keys(errors).length === 0 };
}

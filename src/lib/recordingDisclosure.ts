// Per-tenant call-recording disclosure (Phase 16, T-102).
//
// Calls are recorded and transcribed by Vapi, and Florida (plus several other
// states) requires every party on a call to be told that. This module is the
// single source of truth for the spoken notice:
//
// - Missing `recordingDisclosure` field on a tenant = DEFAULT ON with the
//   drafted default sentence below (no migration; existing tenants get it).
// - The default sentences are DRAFTS, not legal advice — owners should have
//   counsel review any wording they rely on.
// - Fail-open: the resolve/compose helpers never throw. An unknown industry
//   or a malformed stored value just greets normally (disclosure composed
//   from whatever is usable, or omitted only when explicitly disabled).
//
// Pure TS on purpose: both the server (webhook assistant-request, settings
// persona push, demo-customize) and the settings page (live preview) import
// this so the spoken greeting and its preview can never drift.

import type { BusinessConfig } from "@/types";

export const DEFAULT_RECORDING_DISCLOSURE_EN =
  "This call may be recorded and transcribed for quality and training.";

export const DEFAULT_RECORDING_DISCLOSURE_ES =
  "Esta llamada puede ser grabada y transcrita para fines de calidad y entrenamiento.";

/** Server-side cap for owner-edited wording (see PUT /api/company/settings). */
export const RECORDING_DISCLOSURE_MAX_LENGTH = 300;

// HTML/markup detection for owner-edited wording. A spoken notice must be
// plain text; anything that looks like a tag is rejected rather than spoken
// (or worse, rendered) literally.
const HTML_PATTERN = /<[a-z][^>]*>/i;

export interface RecordingDisclosureResolved {
  enabled: boolean;
  /** The exact sentence spoken — owner text when set, otherwise the drafted default. */
  text: string;
}

export function defaultRecordingDisclosureText(agentLanguage?: "en" | "es"): string {
  return agentLanguage === "es"
    ? DEFAULT_RECORDING_DISCLOSURE_ES
    : DEFAULT_RECORDING_DISCLOSURE_EN;
}

/**
 * Resolve the effective disclosure for a tenant. Missing field = default ON;
 * an empty/whitespace owner text falls back to the drafted default so the
 * greeting is never left with a dangling empty sentence.
 */
export function resolveRecordingDisclosure(
  config: Pick<BusinessConfig, "recordingDisclosure" | "agentLanguage">
): RecordingDisclosureResolved {
  const raw = config.recordingDisclosure;
  if (!raw || typeof raw.enabled !== "boolean") {
    return { enabled: true, text: defaultRecordingDisclosureText(config.agentLanguage) };
  }
  const text =
    typeof raw.text === "string" && raw.text.trim().length > 0
      ? raw.text.trim()
      : defaultRecordingDisclosureText(config.agentLanguage);
  return { enabled: raw.enabled, text };
}

/**
 * Compose the disclosure into a spoken greeting. When enabled, the notice is
 * one sentence spoken FIRST (before the greeting), which keeps the greeting
 * natural and works for any custom greeting without parsing it. When
 * disabled, the base greeting is returned untouched.
 */
export function composeGreetingWithDisclosure(
  baseGreeting: string | undefined | null,
  disclosure: RecordingDisclosureResolved
): string {
  const base = (baseGreeting ?? "").trim();
  if (!disclosure.enabled) return base;
  const notice = disclosure.text.trim();
  if (!notice) return base;
  if (!base) return notice;
  return `${notice} ${base}`;
}

export type RecordingDisclosureValidation =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validate owner-edited wording: at most RECORDING_DISCLOSURE_MAX_LENGTH
 * characters and no HTML. An empty string is fine — it means "use the
 * drafted default" at resolve time.
 */
export function validateRecordingDisclosureText(text: string): RecordingDisclosureValidation {
  const trimmed = text.trim();
  if (trimmed.length > RECORDING_DISCLOSURE_MAX_LENGTH) {
    return {
      ok: false,
      error: `The recording notice must be ${RECORDING_DISCLOSURE_MAX_LENGTH} characters or fewer.`,
    };
  }
  if (HTML_PATTERN.test(trimmed)) {
    return { ok: false, error: "The recording notice must be plain text — no HTML or markup." };
  }
  return { ok: true };
}

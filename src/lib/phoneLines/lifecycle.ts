import type { LineStatus } from "@/types/phoneLine";

// Phase 32 (T-171): the one place that decides which line action is allowed from which state. Pure, so the admin route
// and its tests share it. Draft → Provisioned → Connected → Test passed → Live → Retired.

export type LineAction = "mark_provisioned" | "mark_connected" | "record_test" | "go_live" | "retire" | "set_sms";
export const LINE_ACTIONS: readonly LineAction[] = ["mark_provisioned", "mark_connected", "record_test", "go_live", "retire", "set_sms"];

const FROM: Record<Exclude<LineAction, "set_sms">, readonly LineStatus[]> = {
  mark_provisioned: ["draft"],
  mark_connected: ["draft", "provisioned"],
  record_test: ["connected", "test_passed", "live"],
  go_live: ["test_passed"],
  retire: ["draft", "provisioned", "connected", "test_passed", "live"],
};

const BLOCKED_REASON: Record<Exclude<LineAction, "set_sms">, string> = {
  mark_provisioned: "Only a Draft line can be marked provisioned.",
  mark_connected: "Only a Draft or Provisioned line can be marked connected.",
  record_test: "Connect the line before recording a test call.",
  go_live: "A line goes live only after a test call has passed.",
  retire: "This line is already retired.",
};

export function transition(current: LineStatus, action: LineAction): { ok: true; next: LineStatus } | { ok: false; reason: string } {
  if (action === "set_sms") {
    return current === "retired" ? { ok: false, reason: "A retired line cannot send texts." } : { ok: true, next: current };
  }
  if (!FROM[action].includes(current)) return { ok: false, reason: BLOCKED_REASON[action] };
  const next: Record<Exclude<LineAction, "set_sms">, LineStatus> = {
    mark_provisioned: "provisioned",
    mark_connected: "connected",
    // A re-test on a live line keeps it live (it only refreshes the evidence).
    record_test: current === "live" ? "live" : "test_passed",
    go_live: "live",
    retire: "retired",
  };
  return { ok: true, next: next[action] };
}

/** The ElevenLabs routing after `e164` goes live on a tenant (primary if free, otherwise an extra, max 5). */
export function routingWithLine(
  current: { phoneNumber?: string | null; extraPhoneNumbers?: string[] },
  e164: string,
): { phoneNumber: string; extraPhoneNumbers: string[] } | { error: string } {
  const extras = [...(current.extraPhoneNumbers ?? [])];
  if (current.phoneNumber === e164 || extras.includes(e164)) {
    return { phoneNumber: current.phoneNumber ?? e164, extraPhoneNumbers: extras };
  }
  if (!current.phoneNumber) return { phoneNumber: e164, extraPhoneNumbers: extras };
  if (extras.length >= 5) return { error: "This business already has 5 extra numbers." };
  return { phoneNumber: current.phoneNumber, extraPhoneNumbers: [...extras, e164] };
}

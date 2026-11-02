import type { CaptureResult } from "posthog-js";
import { analyticsContext, anonymousPage, eligibleClient, PRODUCT_EVENTS } from "./client";
import { trackedPage } from "./pageView";

export const REPLAY_SAMPLE = 0.2;
const allowed = new Set<string>(["$pageview", "$exception", "$rageclick", "$dead_click", "$snapshot", ...PRODUCT_EVENTS]);
const propsAllowed = new Set(["job_id", "request_id", "crew_id", "step_id", "count"]);
export function replayAllowed(path: string) {
  return !/^\/(field|legal)(\/|$)/.test(path) && !/^\/company\/field(\/|$)/.test(path);
}
export function cleanUrl(value: string) { return value.split(/[?#]/, 1)[0]; }
// Snapshots can contain nested URLs (including meta.href). Scrub before SDK compression.
function scrub(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (/url|href|filename/i.test(key) || /^https?:\/\//.test(value)) return cleanUrl(value);
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v, k)]));
  return value;
}
export function beforeSend(event: CaptureResult | null): CaptureResult | null {
  if (!event || !allowed.has(event.event) || typeof window === "undefined") return null;
  const path = window.location.pathname;
  const page = trackedPage(path);
  const client = eligibleClient();
  const publicPage = anonymousPage(path);
  const { user, business } = analyticsContext();
  if (!client && !(event.event === "$pageview" && publicPage && !user)) return null;
  if (!page || (event.event === "$snapshot" && (!client || !replayAllowed(path)))) return null;
  const properties: Record<string, unknown> = {
    page, $current_url: `https://crm.luxordev.com${page}`, $pathname: page, $host: "crm.luxordev.com",
    $session_id: event.properties.$session_id, $window_id: event.properties.$window_id,
    // `token` is the public project key PostHog requires on every event — without it the SDK silently drops the event
    // ("had its 'token' property removed in a beforeSend function"); that is why no CRM event arrived before 2026-11-02.
    token: event.properties.token, $lib: event.properties.$lib, $lib_version: event.properties.$lib_version,
    distinct_id: event.properties.distinct_id, $device_id: event.properties.$device_id, $is_identified: client,
    ...(client ? { business_id: business!.businessId, industry: business!.industry, role: user!.role } : {}),
  };
  for (const [key, value] of Object.entries(event.properties)) {
    if (propsAllowed.has(key) && (typeof value === "number" || (typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value)))) properties[key] = value;
  }
  if (event.event === "$exception") {
    // Error messages can echo customer text. Keep type and source frames, never values or local variables.
    const list = event.properties.$exception_list;
    if (Array.isArray(list)) properties.$exception_list = list.map((error) => ({
      type: typeof error.type === "string" ? error.type : "Error", value: "[masked]",
      stacktrace: { frames: Array.isArray(error.stacktrace?.frames) ? error.stacktrace.frames.map((frame: Record<string, unknown>) => ({
        filename: typeof frame.filename === "string" ? cleanUrl(frame.filename) : undefined,
        lineno: frame.lineno, colno: frame.colno, function: frame.function,
      })) : [] },
    }));
  }
  if (event.event === "$snapshot") {
    properties.$snapshot_data = scrub(event.properties.$snapshot_data);
    properties.$snapshot_bytes = event.properties.$snapshot_bytes;
    properties.$session_start_timestamp = event.properties.$session_start_timestamp;
  }
  return { ...event, properties };
}

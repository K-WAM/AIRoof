// This bridge reuses auth/bootstrap results; it never imports the SDK or fetches data.
export const PRODUCT_EVENTS = [
  "request_reviewed", "job_created", "crew_assigned", "crew_confirmed",
  "field_note_sent", "field_note_failed", "quote_sent", "invoice_sent", "report_sent",
  "payment_recorded", "setup_step_done", "upgrade_requested", "feedback_sent",
] as const;
export type ProductEvent = typeof PRODUCT_EVENTS[number];
export type EventProps = Partial<Record<"job_id" | "request_id" | "crew_id" | "step_id" | "count", string | number>>;
export interface AnalyticsUser {
  viewAs?: unknown;
  uid: string; businessId?: string; role?: string; superadmin?: boolean;
  isSandboxVisitor?: boolean; isDemoTrial?: boolean;
}
export interface AnalyticsBusiness {
  businessId: string; industry: string | null; isDemo?: boolean;
  subscriptionStatus: string | null;
}
let user: AnalyticsUser | null = null;
let business: AnalyticsBusiness | null = null;
let capture: ((event: ProductEvent, props: EventProps) => void) | null = null;
const listeners = new Set<() => void>();
const readyListeners = new Set<() => void>();
export function analyticsReady() { return capture !== null && eligibleClient(); }
export function subscribeAnalyticsReady(listener: () => void) {
  readyListeners.add(listener);
  return () => { readyListeners.delete(listener); };
}
export function analyticsContext() { return { user, business }; }
export function subscribeAnalytics(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setAnalyticsUser(value: AnalyticsUser | null) {
  user = value; listeners.forEach((listener) => listener());
}
export function setAnalyticsBusiness(value: AnalyticsBusiness | null) {
  business = value; listeners.forEach((listener) => listener());
}
export function anonymousPage(path: string) {
  // Public pages have no AuthProvider. An existing session must not be mistaken for a logged-out visitor.
  const hasSession = typeof document !== "undefined" && /(?:^|;\s*)__session=[^;]+/.test(document.cookie);
  return !user && !hasSession && (path === "/" || path === "/login" || path === "/field" || path.startsWith("/try/"));
}
export function eligibleClient() {
  return !!user && !!business && user.businessId === business.businessId &&
    !user.viewAs && !user.superadmin && user.role !== "superadmin" && !user.isSandboxVisitor && !user.isDemoTrial &&
    business.isDemo === false && business.subscriptionStatus !== "trial" &&
    !/^(demo|sandbox|trial|e2e|test)(-|$)/.test(business.businessId);
}
export function bindAnalytics(value: typeof capture) {
  capture = value; readyListeners.forEach((listener) => listener());
}
/** Explicit success/failure events: IDs and counts only. Safe before initialization and when blocked. */
export function track(event: ProductEvent, props: EventProps = {}) {
  try { if (eligibleClient() && PRODUCT_EVENTS.includes(event)) capture?.(event, props); } catch { /* optional */ }
}

// The Dashboard's per-industry tiles and their counts. Split out of starterKits.ts (2026-10-08) so the Dashboard's
// browser bundle no longer carries every industry's starter price list just to draw four numbers.
import type { VerticalId } from "./templates";

/** One layout per vertical: Record<VerticalId, …> makes tsc fail until a new vertical has its tiles. */
export type TileMetric = "visitsToday" | "openJobs" | "awaitingInvoice" | "todayBookings" | "pendingConfirmations" | "tourRequestsThisWeek" | "urgentLeads";
export interface DashboardTile { label: string; metric: TileMetric; href: "jobs" | "pipeline" | "appointments"; }
const jobTiles: DashboardTile[] = [
  { label: "Open jobs", metric: "openJobs", href: "jobs" },
  { label: "Awaiting invoice", metric: "awaitingInvoice", href: "jobs" },
  { label: "Today's bookings", metric: "todayBookings", href: "appointments" },
];
const bookingTiles: DashboardTile[] = [
  { label: "Today's bookings", metric: "todayBookings", href: "appointments" },
  { label: "Pending confirmations", metric: "pendingConfirmations", href: "appointments" },
  { label: "Urgent leads", metric: "urgentLeads", href: "pipeline" },
];
const tourTiles: DashboardTile[] = [
  { label: "Tour requests this week", metric: "tourRequestsThisWeek", href: "pipeline" },
  { label: "Today's bookings", metric: "todayBookings", href: "appointments" },
  { label: "Pending confirmations", metric: "pendingConfirmations", href: "appointments" },
];
// Scheduling + getting paid: what a dog-walking business checks first thing.
const visitTiles: DashboardTile[] = [
  { label: "Today's visits", metric: "visitsToday", href: "jobs" },
  { label: "New bookings to confirm", metric: "pendingConfirmations", href: "appointments" },
  { label: "Awaiting invoice", metric: "awaitingInvoice", href: "jobs" },
];
export const DASHBOARD_TILES: Record<VerticalId, DashboardTile[]> = {
  roofing: jobTiles, hvac: jobTiles, landscaping: jobTiles, cleaning: jobTiles,
  dental: bookingTiles, "care-homes": tourTiles, "property-management": bookingTiles,
  "general-contractors": jobTiles, electricians: jobTiles, "appliance-repair": jobTiles,
  childcare: bookingTiles, daycares: tourTiles, "junk-removal": jobTiles, "pet-care": visitTiles,
};

export function tilesFor(industry: unknown): DashboardTile[] | null {
  return typeof industry === "string" && Object.prototype.hasOwnProperty.call(DASHBOARD_TILES, industry)
    ? DASHBOARD_TILES[industry as VerticalId]
    : null;
}

type MetricLead = { urgency: string; serviceRequested?: string; createdAt: number };
type MetricAppointment = { startTime: number; status: string; pendingConfirmation?: boolean };
type MetricJob = { status: string; invoiceId?: string; scheduledStart?: number };

export function countDashboardMetrics(
  leads: MetricLead[], appointments: MetricAppointment[], jobs: MetricJob[], tz: string, now: number
): Record<TileMetric, number> {
  const localDate = (value: number) => new Date(new Date(value).toLocaleDateString("en-US", { timeZone: tz }));
  const today = localDate(now);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return {
    visitsToday: jobs.filter((j) => j.scheduledStart && +localDate(j.scheduledStart) === +today && j.status !== "invoiced").length,
    openJobs: jobs.filter((j) => j.status !== "complete" && j.status !== "invoiced").length,
    awaitingInvoice: jobs.filter((j) => j.status === "complete" && !j.invoiceId).length,
    todayBookings: appointments.filter((a) => a.status !== "cancelled" && +localDate(a.startTime) === +today).length,
    pendingConfirmations: appointments.filter((a) => a.pendingConfirmation && a.status !== "confirmed" && a.status !== "cancelled").length,
    tourRequestsThisWeek: leads.filter((l) => {
      const date = localDate(l.createdAt);
      return date >= monday && date <= today && /\b(tour|visit)\b/i.test(l.serviceRequested ?? "");
    }).length,
    urgentLeads: leads.filter((l) => l.urgency.toLowerCase() === "urgent").length,
  };
}


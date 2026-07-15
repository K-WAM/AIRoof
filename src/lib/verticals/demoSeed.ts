// Sample demo data (calls / leads / appointments / resources / jobs) generated per
// vertical from the vertical templates. Used by the Demo Studio's universal live
// line: each launch reseeds the live demo business so its dashboard reads as the
// chosen industry.
//
// Two things are seeded deliberately so the demo never opens on an empty screen:
//  - one after-hours, pending-approval appointment WITH a customer email, so the
//    "Pending Your Approval → Confirm & notify customer" flow is demonstrable;
//  - resources (crews/providers/vendors) plus something unassigned to drag, so
//    the Calendar board always has rows and a live drag to show.

import { VERTICAL_TEMPLATES, type VerticalId } from "./templates";

const CALLERS = [
  { name: "Jordan Blake", phone: "+13055550110" },
  { name: "Priya Shah", phone: "+13055550111" },
  { name: "Marcus Lee", phone: "+13055550112" },
  { name: "Dana Cole", phone: "+13055550113" },
  { name: "Sofia Ramirez", phone: "+13055550114" },
  { name: "Tom Becker", phone: "+13055550115" },
];

const ADDRESSES = [
  "120 NW 7th St, Miami, FL",
  "88 Brickell Ave, Miami, FL",
  "455 Coral Way, Coral Gables, FL",
  "12 Sunset Dr, Doral, FL",
  "9 Palm Ct, Kendall, FL",
];

// Resource names per vertical — these become the Calendar's rows. Colors match the
// palette the crews API auto-assigns from.
const RESOURCE_COLORS = ["#2563eb", "#16a34a", "#d97706"];

const RESOURCES: Record<VerticalId, string[]> = {
  roofing: ["Carlos Crew", "Tyler Crew", "Storm Response"],
  hvac: ["Marco R.", "Denise K.", "After-hours On-call"],
  landscaping: ["Luis Crew", "Ana Crew", "Tree & Removal"],
  cleaning: ["Team A — Rosa", "Team B — Nadia", "Deep Clean Crew"],
  dental: ["Dr. Rivera", "Dr. Chen", "Hygiene — Sam"],
  "property-management": ["Ace Plumbing", "BrightSpark Electric", "On-call Manager"],
  "general-contractors": ["Dave's Crew", "Framing Crew", "Finish Carpentry"],
};

export interface DemoSeed {
  resources: Array<{ name: string; email: string; color: string }>;
  jobs: Array<{
    title: string;
    clientName: string;
    clientPhone: string;
    address: string;
    serviceType: string;
    status: string;
  }>;
  calls: Array<{
    callerName: string;
    callerPhone: string;
    serviceType: string;
    outcome: "scheduled" | "lead_captured" | "escalated" | "no_action";
    summary: string;
    isAfterHours: boolean;
  }>;
  leads: Array<{
    callerName: string;
    callerPhone: string;
    serviceRequested: string;
    urgency: "low" | "normal" | "urgent";
    status: "new" | "contacted";
    address: string;
  }>;
  appointments: Array<{
    callerName: string;
    callerPhone: string;
    callerEmail?: string;
    serviceType: string;
    startTime: number;
    status: "requested" | "confirmed";
    pendingConfirmation?: boolean;
    address: string;
    // Index into `resources`, or undefined to leave it in the Calendar's
    // "Unassigned" rail as the thing you drag during a demo.
    resourceIndex?: number;
  }>;
}

export function demoSeedFor(verticalId: VerticalId, now: number = Date.now()): DemoSeed {
  const t = VERTICAL_TEMPLATES[verticalId];
  const svc = t.approvedServices;
  const s = (i: number) => svc[i] ?? svc[0];
  const day = 86_400_000;
  const apptMode = t.calendarMode === "appointments";

  const resources = RESOURCES[verticalId].map((name, i) => ({
    name,
    email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}@example.com`,
    color: RESOURCE_COLORS[i % RESOURCE_COLORS.length],
  }));

  // Field-service verticals demo the Jobs → Field → Calendar story, so they need
  // open jobs. Intake verticals have none by design.
  const jobs = apptMode
    ? []
    : [
        { title: `${s(0)} — ${ADDRESSES[3]}`, clientName: CALLERS[0].name, clientPhone: CALLERS[0].phone, address: ADDRESSES[3], serviceType: s(0), status: "inspection" },
        { title: `${s(1)} — ${ADDRESSES[4]}`, clientName: CALLERS[2].name, clientPhone: CALLERS[2].phone, address: ADDRESSES[4], serviceType: s(1), status: "in_progress" },
        { title: `${s(2)} — ${ADDRESSES[0]}`, clientName: CALLERS[5].name, clientPhone: CALLERS[5].phone, address: ADDRESSES[0], serviceType: s(2), status: "quoted" },
      ];

  return {
    resources,
    jobs,
    calls: [
      { callerName: CALLERS[0].name, callerPhone: CALLERS[0].phone, serviceType: s(0), outcome: "scheduled", summary: `${s(0)} — appointment booked.`, isAfterHours: false },
      { callerName: CALLERS[1].name, callerPhone: CALLERS[1].phone, serviceType: s(1), outcome: "lead_captured", summary: `${s(1)} — lead captured, team to follow up.`, isAfterHours: false },
      { callerName: CALLERS[2].name, callerPhone: CALLERS[2].phone, serviceType: s(2), outcome: "scheduled", summary: `${s(2)} — appointment set.`, isAfterHours: false },
      { callerName: CALLERS[3].name, callerPhone: CALLERS[3].phone, serviceType: s(1), outcome: "escalated", summary: "After-hours urgent call — booked and flagged for confirmation.", isAfterHours: true },
      { callerName: "Unknown caller", callerPhone: CALLERS[4].phone, serviceType: "General inquiry", outcome: "no_action", summary: "Caller hung up before leaving details.", isAfterHours: false },
    ],
    leads: [
      { callerName: CALLERS[1].name, callerPhone: CALLERS[1].phone, serviceRequested: s(1), urgency: "normal", status: "new", address: ADDRESSES[0] },
      { callerName: CALLERS[4].name, callerPhone: CALLERS[4].phone, serviceRequested: s(3), urgency: "urgent", status: "new", address: ADDRESSES[1] },
      { callerName: CALLERS[5].name, callerPhone: CALLERS[5].phone, serviceRequested: s(2), urgency: "normal", status: "contacted", address: ADDRESSES[2] },
    ],
    appointments: [
      // In appointments mode these carry a resource so the board opens populated.
      { callerName: CALLERS[0].name, callerPhone: CALLERS[0].phone, serviceType: s(0), startTime: now + 1 * day, status: "confirmed", address: ADDRESSES[3], resourceIndex: apptMode ? 0 : undefined },
      { callerName: CALLERS[2].name, callerPhone: CALLERS[2].phone, serviceType: s(2), startTime: now + 3 * day, status: "confirmed", address: ADDRESSES[4], resourceIndex: apptMode ? 1 : undefined },
      // After-hours, pending approval, WITH a captured email — showcases the
      // dashboard "Pending Your Approval" section + "Confirm & notify customer".
      // Left unassigned so it's also the card you drag on the Calendar.
      { callerName: CALLERS[3].name, callerPhone: CALLERS[3].phone, callerEmail: "dana.cole@example.com", serviceType: s(1), startTime: now + 2 * day, status: "requested", pendingConfirmation: true, address: ADDRESSES[0] },
    ],
  };
}

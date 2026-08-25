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
  { name: "Lena Park", phone: "+13055550116" },
  { name: "Owen Grant", phone: "+13055550117" },
  { name: "Camila Reyes", phone: "+13055550118" },
  { name: "Devon Walsh", phone: "+13055550119" },
  { name: "Fatima Hassan", phone: "+13055550120" },
  { name: "Jake Morrison", phone: "+13055550121" },
  { name: "Naomi Chen", phone: "+13055550122" },
  { name: "Andre Dubois", phone: "+13055550123" },
  { name: "Rosa Mendez", phone: "+13055550124" },
  { name: "Elliot Cross", phone: "+13055550125" },
  { name: "Yuki Tanaka", phone: "+13055550126" },
  { name: "Mateo Alvarez", phone: "+13055550127" },
];

const ADDRESSES = [
  "120 NW 7th St, Miami, FL",
  "88 Brickell Ave, Miami, FL",
  "455 Coral Way, Coral Gables, FL",
  "12 Sunset Dr, Doral, FL",
  "9 Palm Ct, Kendall, FL",
  "2100 Biscayne Blvd, Miami, FL",
  "741 Ocean Dr, Miami Beach, FL",
  "56 SW 8th St, Miami, FL",
  "3301 Rickenbacker Cswy, Key Biscayne, FL",
  "18 Merrick Way, Coral Gables, FL",
  "9200 NW 25th St, Doral, FL",
  "1440 SW 1st Ave, Miami, FL",
  "789 NE 79th St, Miami, FL",
];

// Resource names per vertical — these become the Calendar's rows. Colors match the
// palette the crews API auto-assigns from.
const RESOURCE_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777"];

const RESOURCES: Record<VerticalId, string[]> = {
  roofing: ["Carlos Crew", "Tyler Crew", "Storm Response", "Gutter Team", "Repair Crew"],
  hvac: ["Marco R.", "Denise K.", "Luis T.", "Raj P.", "After-hours On-call"],
  landscaping: ["Luis Crew", "Ana Crew", "Tree & Removal", "Design & Install", "Irrigation Team"],
  cleaning: ["Team A — Rosa", "Team B — Nadia", "Team C — Gina", "Deep Clean Crew", "Post-Construction Crew"],
  dental: ["Dr. Rivera", "Dr. Chen", "Dr. Park", "Hygiene — Sam", "Hygiene — Jess"],
  "property-management": ["Ace Plumbing", "BrightSpark Electric", "CoolBreeze HVAC", "On-call Manager", "Turnover Crew"],
  "general-contractors": ["Dave's Crew", "Framing Crew", "Finish Carpentry", "Drywall Crew", "Concrete Crew"],
  electricians: ["Danny Crew", "Spark Crew", "Panel Team", "Emergency Response", "Wiring Crew"],
  "appliance-repair": ["Sam T.", "Rita K.", "Miguel P.", "Dana W.", "After-hours On-call"],
  childcare: ["Jenna M.", "Priya S.", "Marcus T.", "Weekend Team", "After-hours On-call"],
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

// Status stepper progression to spread jobs across so the board tells a story
// rather than reading as one flat list.
const JOB_STATUSES = [
  "inspection", "inspection", "inspection",
  "quoted", "quoted", "quoted",
  "in_progress", "in_progress", "in_progress",
  "invoiced", "invoiced",
  "open", "open",
  "complete",
] as const;

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

  // Field-service verticals demo the Jobs → Field → Calendar story. Target ~15
  // jobs spread across the stepper so the Dashboard shows variety at a glance.
  const jobs: DemoSeed["jobs"] = apptMode
    ? []
    : Array.from({ length: 14 }, (_, i) => {
        const status = JOB_STATUSES[i] ?? "inspection";
        const caller = CALLERS[i % CALLERS.length];
        const addr = ADDRESSES[i % ADDRESSES.length];
        const svcIdx = i % svc.length;
        return {
          title: `${s(svcIdx)} — ${addr}`,
          clientName: caller.name,
          clientPhone: caller.phone,
          address: addr,
          serviceType: s(svcIdx),
          status,
        };
      });

  // Build a roster of calls, leads, and appointments so the Dashboard, Pipeline,
  // and Calendar all read populated at a glance. Caller/address/progression are
  // distributed across the pool so no vertical looks like a copy-paste.
  const calls: DemoSeed["calls"] = [
    { callerName: CALLERS[0].name, callerPhone: CALLERS[0].phone, serviceType: s(0), outcome: "scheduled", summary: `${s(0)} — appointment booked.`, isAfterHours: false },
    { callerName: CALLERS[1].name, callerPhone: CALLERS[1].phone, serviceType: s(1), outcome: "lead_captured", summary: `${s(1)} — lead captured, team to follow up.`, isAfterHours: false },
    { callerName: CALLERS[2].name, callerPhone: CALLERS[2].phone, serviceType: s(2), outcome: "scheduled", summary: `${s(2)} — appointment set.`, isAfterHours: false },
    { callerName: CALLERS[3].name, callerPhone: CALLERS[3].phone, serviceType: s(1), outcome: "escalated", summary: "After-hours urgent call — booked and flagged for confirmation.", isAfterHours: true },
    { callerName: "Unknown caller", callerPhone: CALLERS[4].phone, serviceType: "General inquiry", outcome: "no_action", summary: "Caller hung up before leaving details.", isAfterHours: false },
    { callerName: CALLERS[5].name, callerPhone: CALLERS[5].phone, serviceType: s(0), outcome: "scheduled", summary: `${s(0)} — same-day slot booked.`, isAfterHours: false },
    { callerName: CALLERS[6].name, callerPhone: CALLERS[6].phone, serviceType: s(3), outcome: "lead_captured", summary: `${s(3)} — callback requested.`, isAfterHours: false },
    { callerName: CALLERS[7].name, callerPhone: CALLERS[7].phone, serviceType: s(1), outcome: "scheduled", summary: `${s(1)} — morning slot confirmed.`, isAfterHours: false },
  ];

  const leads: DemoSeed["leads"] = [
    { callerName: CALLERS[1].name, callerPhone: CALLERS[1].phone, serviceRequested: s(1), urgency: "normal", status: "new", address: ADDRESSES[0] },
    { callerName: CALLERS[4].name, callerPhone: CALLERS[4].phone, serviceRequested: s(3), urgency: "urgent", status: "new", address: ADDRESSES[1] },
    { callerName: CALLERS[5].name, callerPhone: CALLERS[5].phone, serviceRequested: s(2), urgency: "normal", status: "contacted", address: ADDRESSES[2] },
    { callerName: CALLERS[6].name, callerPhone: CALLERS[6].phone, serviceRequested: s(0), urgency: "low", status: "new", address: ADDRESSES[3] },
    { callerName: CALLERS[9].name, callerPhone: CALLERS[9].phone, serviceRequested: s(1), urgency: "normal", status: "contacted", address: ADDRESSES[4] },
  ];

  // Intake verticals (dental, property-management) schedule bookings onto
  // providers. Field-service verticals use the appointments array to show the
  // Pipeline tab and the Calendar board. All verticals get:
  //  - most bookings confirmed + assigned to a resource (solid, crew-colored)
  //  - 2–3 provisional (grey-dashed)
  //  - at least one left unassigned (drag target)
  //  - one after-hours pending-confirmation booking with email (Dashboard approval demo)
  const appointments: DemoSeed["appointments"] = [
    // Confirmed, assigned — opens a populated board.
    { callerName: CALLERS[0].name, callerPhone: CALLERS[0].phone, serviceType: s(0), startTime: now + 0.5 * day, status: "confirmed", address: ADDRESSES[0], resourceIndex: apptMode ? 0 : 0 },
    { callerName: CALLERS[2].name, callerPhone: CALLERS[2].phone, serviceType: s(2), startTime: now + 1 * day, status: "confirmed", address: ADDRESSES[1], resourceIndex: apptMode ? 1 : 1 },
    { callerName: CALLERS[5].name, callerPhone: CALLERS[5].phone, serviceType: s(2), startTime: now + 1.5 * day, status: "confirmed", address: ADDRESSES[3], resourceIndex: apptMode ? 2 : 0 },
    { callerName: CALLERS[7].name, callerPhone: CALLERS[7].phone, serviceType: s(0), startTime: now + 2.5 * day, status: "confirmed", address: ADDRESSES[5], resourceIndex: apptMode ? 3 : 2 },
    { callerName: CALLERS[8].name, callerPhone: CALLERS[8].phone, serviceType: s(3) ?? s(1), startTime: now + 3 * day, status: "confirmed", address: ADDRESSES[6], resourceIndex: apptMode ? 4 : 1 },
    { callerName: CALLERS[10].name, callerPhone: CALLERS[10].phone, serviceType: s(0), startTime: now + 4 * day, status: "confirmed", address: ADDRESSES[7], resourceIndex: apptMode ? 0 : undefined },
    { callerName: CALLERS[11].name, callerPhone: CALLERS[11].phone, serviceType: s(1), startTime: now + 4.5 * day, status: "confirmed", address: ADDRESSES[8], resourceIndex: apptMode ? 1 : undefined },
    { callerName: CALLERS[12].name, callerPhone: CALLERS[12].phone, serviceType: s(2), startTime: now + 5 * day, status: "confirmed", address: ADDRESSES[9], resourceIndex: apptMode ? 2 : undefined },
    // Provisional / grey-dashed — these read as "unconfirmed" on the Calendar.
    { callerName: CALLERS[13].name, callerPhone: CALLERS[13].phone, serviceType: s(1), startTime: now + 6 * day, status: "requested", address: ADDRESSES[10], resourceIndex: apptMode ? 0 : undefined },
    { callerName: CALLERS[14].name, callerPhone: CALLERS[14].phone, serviceType: s(0), startTime: now + 6.5 * day, status: "requested", address: ADDRESSES[11], resourceIndex: apptMode ? undefined : undefined },
    { callerName: CALLERS[15].name, callerPhone: CALLERS[15].phone, serviceType: s(2), startTime: now + 7 * day, status: "requested", address: ADDRESSES[12], resourceIndex: apptMode ? undefined : undefined },
    // Unassigned — these sit in the Unscheduled/Unassigned rail as drag targets.
    { callerName: CALLERS[16].name, callerPhone: CALLERS[16].phone, serviceType: s(0), startTime: now + 1 * day, status: "requested", pendingConfirmation: false, address: ADDRESSES[2], resourceIndex: undefined },
    { callerName: CALLERS[17].name, callerPhone: CALLERS[17].phone, serviceType: s(1), startTime: now + 3.5 * day, status: "requested", pendingConfirmation: false, address: ADDRESSES[4], resourceIndex: undefined },
    // After-hours, pending approval, WITH a captured email — showcases the
    // dashboard "Pending Your Approval" section + "Confirm & notify customer".
    // Left unassigned so it's also the card you drag on the Calendar.
    { callerName: CALLERS[3].name, callerPhone: CALLERS[3].phone, callerEmail: "dana.cole@example.com", serviceType: s(1), startTime: now + 2 * day, status: "requested", pendingConfirmation: true, address: ADDRESSES[0], resourceIndex: undefined },
  ];

  return {
    resources,
    jobs,
    calls,
    leads,
    appointments,
  };
}

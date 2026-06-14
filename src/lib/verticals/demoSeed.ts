// Sample demo data (calls / leads / appointments) generated per vertical from the
// vertical templates. Used by the Demo Studio's universal live line: each launch
// reseeds the live demo business so its dashboard reads as the chosen industry.
// One appointment is intentionally an after-hours, pending-approval booking WITH a
// customer email so the "pending approval → Confirm & notify customer" flow is
// demonstrable immediately.

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

export interface DemoSeed {
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
  }>;
}

export function demoSeedFor(verticalId: VerticalId, now: number = Date.now()): DemoSeed {
  const t = VERTICAL_TEMPLATES[verticalId];
  const svc = t.approvedServices;
  const s = (i: number) => svc[i] ?? svc[0];
  const day = 86_400_000;

  return {
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
      { callerName: CALLERS[0].name, callerPhone: CALLERS[0].phone, serviceType: s(0), startTime: now + 1 * day, status: "confirmed", address: ADDRESSES[3] },
      { callerName: CALLERS[2].name, callerPhone: CALLERS[2].phone, serviceType: s(2), startTime: now + 3 * day, status: "confirmed", address: ADDRESSES[4] },
      // After-hours, pending approval, WITH a captured email — showcases the
      // dashboard "Pending Your Approval" section + "Confirm & notify customer".
      { callerName: CALLERS[3].name, callerPhone: CALLERS[3].phone, callerEmail: "dana.cole@example.com", serviceType: s(1), startTime: now + 2 * day, status: "requested", pendingConfirmation: true, address: ADDRESSES[0] },
    ],
  };
}

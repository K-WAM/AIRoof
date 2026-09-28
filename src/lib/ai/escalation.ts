// Phase 31 (plan §2.1): whether the phone AI may escalate a call to a person (escalateCall).
//
// Owner decision 2026-09-28: a roofing leak is booked into the soonest opening, not escalated — the escalation email
// stopped the booking and told Carla "anything else?". `escalationEnabled` on the business decides; when it is missing
// the vertical template decides: field trades (roofing, HVAC, …) are OFF, while the care and property families stay ON
// because their emergency rules protect people ("a child is missing", "a resident fell") and booking a slot is no answer.
// The ElevenLabs agent is shared by every tenant, so this is a server-side switch (the tool route refuses escalateCall
// while it is off) plus prompt wording — never a change to the shared tool list.

import { VERTICAL_TEMPLATES, type VerticalId } from "@/lib/verticals/templates";

export function isEscalationEnabled(config: { escalationEnabled?: unknown; industry?: unknown }): boolean {
  if (typeof config.escalationEnabled === "boolean") return config.escalationEnabled;
  const template = typeof config.industry === "string" ? VERTICAL_TEMPLATES[config.industry as VerticalId] : undefined;
  return template ? template.family !== "field" : false;
}

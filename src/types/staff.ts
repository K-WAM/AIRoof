// Staff directory (T-371, owner 2026-11-06): everyone who works at the business, WITH OR WITHOUT a login.
//
// Logins stay where they are (businessUsers, src/types/team.ts) and keep every permission rule. A StaffMember is a
// person record only: it grants nothing, sends nothing and never counts as a seat. The Team page shows one roster
// (logins + staff without a login); Library → Crews shows staff on a crew next to members with a login.
//
// Storage: businesses/{businessId}/staff/{staffId} (server-only: no Firestore rule matches it, the catch-all denies).
// When a person later gets a login, set linkedUid; the roster then shows the login row only (no duplicate).
// Never email, text or invite a StaffMember from code: an invite is always an explicit owner action on the Team page.

import type { Provenance } from "@/types/provenance";
import type { UserType } from "@/lib/team/userTypes";

export interface StaffMember {
  staffId: string;
  name: string;
  /** Their own job title, e.g. "Service Supervisor". */
  position?: string;
  /** Suggested app access if they get a login (a Team-page user type). Descriptive only: grants nothing. */
  userType?: UserType;
  email?: string;
  /** E.164 when known, e.g. +19545550123. */
  mobile?: string;
  language?: "en" | "es" | "both";
  /** One crew, like TeamMember.crewId. */
  crewId?: string;
  /** Where crewId came from when it differs from the record's own provenance: e.g. a real person (origin "client")
   *  whose crew was guessed for the demo (origin "luxor-sample"). Screens tag a luxor-sample crew with "Example";
   *  removing sample data clears crewId + crewProvenance; an owner edit sets it to { origin: "client", source: "app:team" }. */
  crewProvenance?: Provenance;
  /** True for the person who leads that crew (Jobba's "Foreman"). */
  crewLead?: boolean;
  active: boolean;
  /** businessUsers uid once this person has a login. */
  linkedUid?: string;
  provenance: Provenance;
  createdAt: number;
  updatedAt: number;
}

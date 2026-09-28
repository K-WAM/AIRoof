import type { Firestore } from "firebase-admin/firestore";
import { CREW_MEMBER_ROLES } from "@/types/team";

export interface CrewRecipient {
  to: string;
  /** Ledger entityId — one per recipient so a re-confirm never re-sends and one bad address never blocks the rest. */
  entityId: string;
  recipientName?: string;
}

/**
 * Who hears about something on a crew: the crew's own address (when it has one) plus every active member with an
 * email, deduped by inbox. Extracted from POST /api/jobs/[jobId]/assign (T-148) so inspector notifications reuse the
 * exact same recipient rules.
 *
 * The crew address gets `crewEntityId ?? keyPrefix`; each member gets `${keyPrefix}:${uid}`.
 */
export async function crewEmailRecipients(options: {
  db: Firestore;
  businessId: string;
  crewId: string;
  crewEmail?: string | null;
  keyPrefix: string;
  crewEntityId?: string;
}): Promise<CrewRecipient[]> {
  const { db, businessId, crewId, keyPrefix } = options;
  const membersSnapshot = await db
    .collection("businessUsers")
    .where("businessId", "==", businessId)
    .where("crewId", "==", crewId)
    .get();

  const recipients: CrewRecipient[] = [];
  const seen = new Set<string>();

  const crewEmail = (options.crewEmail ?? "").trim();
  if (crewEmail) {
    recipients.push({ to: crewEmail, entityId: options.crewEntityId ?? keyPrefix });
    seen.add(crewEmail.toLowerCase());
  }

  for (const memberDoc of membersSnapshot.docs) {
    const member = memberDoc.data();
    const email = typeof member.email === "string" ? member.email.trim() : "";
    if (member.active === false || !CREW_MEMBER_ROLES.has(member.role) || !email || seen.has(email.toLowerCase())) {
      continue;
    }
    seen.add(email.toLowerCase());
    recipients.push({
      to: email,
      entityId: `${keyPrefix}:${memberDoc.id}`,
      recipientName:
        typeof member.displayName === "string" && member.displayName.trim()
          ? member.displayName.trim()
          : email.split("@")[0],
    });
  }

  return recipients;
}

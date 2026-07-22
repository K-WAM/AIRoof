import { randomUUID } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { AuditEvent, AuditEventInput } from "./types";

export function createAuditEvent(input: AuditEventInput): AuditEvent {
  return Object.freeze({
    eventId: input.eventId ?? `audit_${randomUUID()}`,
    businessId: input.businessId,
    correlationId: input.correlationId,
    action: input.action,
    actor: Object.freeze({ ...input.actor }),
    subject: Object.freeze({ ...input.subject }),
    providerIds: Object.freeze({ ...input.providerIds }),
    result: input.result,
    occurredAt: input.occurredAt ?? Date.now(),
    details: Object.freeze({ ...input.details }),
  });
}

/** Queue an audit event with create-only semantics inside an existing transaction. */
export function createAuditEventInTransaction(
  db: Firestore,
  transaction: Transaction,
  event: AuditEvent
): void {
  const eventRef = db
    .collection("businesses")
    .doc(event.businessId)
    .collection("auditEvents")
    .doc(event.eventId);
  transaction.create(eventRef, event);
}

/**
 * Append an event. Firestore Transaction.create fails if an event ID already
 * exists, preventing an accidental overwrite from mutating audit history.
 */
export async function appendAuditEvent(
  db: Firestore,
  input: AuditEventInput
): Promise<AuditEvent> {
  const event = createAuditEvent(input);
  await db.runTransaction(async (transaction) => {
    createAuditEventInTransaction(db, transaction, event);
  });
  return event;
}

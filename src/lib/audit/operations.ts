import type {
  DocumentData,
  DocumentReference,
  Firestore,
} from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  createAuditEvent,
  createAuditEventInTransaction,
} from "./events";
import {
  buildCallRedactionPlan,
  buildToolIoRedactionPlan,
  redactionSkeletonAsJson,
} from "./redaction";
import type { RetentionPolicy } from "./retentionPolicy";
import type {
  AuditAction,
  AuditActor,
  AuditProviderIds,
} from "./types";

export type CallRedactionOutcome = "redacted" | "unchanged" | "active" | "missing";
export type ToolIoRedactionOutcome = "redacted" | "unchanged" | "missing";

interface CallRedactionOptions {
  readonly action: Extract<AuditAction, "call.delete" | "call.retention_redact">;
  readonly actor: AuditActor;
  readonly correlationId: string;
  readonly eventId: string;
  readonly force: boolean;
  readonly includeIdentifiers: boolean;
  readonly reason: "user_delete" | "retention_policy";
}

interface ToolIoRedactionOptions {
  readonly actor: AuditActor;
  readonly correlationId: string;
  readonly eventId: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function providerIdsFrom(data: Record<string, unknown>): AuditProviderIds {
  return Object.freeze({
    ...(typeof data.vapiCallId === "string" ? { vapiCallId: data.vapiCallId } : {}),
    ...(typeof data.vapiToolCallId === "string"
      ? { vapiToolCallId: data.vapiToolCallId }
      : {}),
    ...(typeof data.deliveryId === "string" ? { deliveryId: data.deliveryId } : {}),
  });
}

export async function redactCallDocument(
  db: Firestore,
  businessId: string,
  callRef: DocumentReference<DocumentData>,
  policy: RetentionPolicy,
  now: number,
  options: CallRedactionOptions
): Promise<CallRedactionOutcome> {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(callRef);
    if (!snapshot.exists) return "missing";
    const data = snapshot.data() ?? {};
    if (data.status === "active") {
      if (options.action === "call.delete") {
        const event = createAuditEvent({
          eventId: options.eventId,
          businessId,
          correlationId: options.correlationId,
          action: options.action,
          actor: options.actor,
          subject: { type: "call", id: callRef.id },
          providerIds: providerIdsFrom(data),
          result: "denied",
          occurredAt: now,
          details: { reason: "active_call" },
        });
        createAuditEventInTransaction(db, transaction, event);
      }
      return "active";
    }

    const plan = buildCallRedactionPlan(data, now, policy, {
      force: options.force,
      includeIdentifiers: options.includeIdentifiers,
    });
    const currentRetention = asRecord(data.retention);

    if (!plan) {
      if (options.action !== "call.delete") return "unchanged";
      const deletedAt =
        typeof currentRetention.deletedAt === "number"
          ? currentRetention.deletedAt
          : now;
      if (currentRetention.deletedAt === undefined) {
        transaction.update(callRef, {
          retention: {
            ...currentRetention,
            version: 1,
            deletedAt,
            lastReason: options.reason,
          },
          updatedAt: now,
        });
      }
      const event = createAuditEvent({
        eventId: options.eventId,
        businessId,
        correlationId: options.correlationId,
        action: options.action,
        actor: options.actor,
        subject: { type: "call", id: callRef.id },
        providerIds: providerIdsFrom(data),
        result: "skipped",
        occurredAt: now,
        details: { reason: options.reason, alreadyRedacted: true },
      });
      createAuditEventInTransaction(db, transaction, event);
      return "unchanged";
    }

    const update: Record<string, unknown> = {
      retention: {
        ...currentRetention,
        version: 1,
        ...plan.skeleton,
        lastRedactedAt: now,
        lastReason: options.reason,
        ...(options.action === "call.delete"
          ? {
              deletedAt:
                typeof currentRetention.deletedAt === "number"
                  ? currentRetention.deletedAt
                  : now,
            }
          : {}),
      },
      updatedAt: now,
    };
    for (const field of plan.fieldsToDelete) update[field] = FieldValue.delete();
    transaction.update(callRef, update);

    const event = createAuditEvent({
      eventId: options.eventId,
      businessId,
      correlationId: options.correlationId,
      action: options.action,
      actor: options.actor,
      subject: { type: "call", id: callRef.id },
      providerIds: providerIdsFrom(data),
      result: "success",
      occurredAt: now,
      details: {
        reason: options.reason,
        fields: plan.fieldsToDelete,
        skeleton: redactionSkeletonAsJson(plan.skeleton),
      },
    });
    createAuditEventInTransaction(db, transaction, event);
    return "redacted";
  });
}

export async function redactToolIoDocument(
  db: Firestore,
  businessId: string,
  actionRef: DocumentReference<DocumentData>,
  policy: RetentionPolicy,
  now: number,
  options: ToolIoRedactionOptions
): Promise<ToolIoRedactionOutcome> {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(actionRef);
    if (!snapshot.exists) return "missing";
    const data = snapshot.data() ?? {};
    const plan = buildToolIoRedactionPlan(data, now, policy);
    if (!plan) return "unchanged";

    const currentRetention = asRecord(data.retention);
    const update: Record<string, unknown> = {
      retention: {
        ...currentRetention,
        version: 1,
        toolIo: plan.skeleton,
        lastRedactedAt: now,
        lastReason: "retention_policy",
      },
    };
    for (const field of plan.fieldsToDelete) update[field] = FieldValue.delete();
    transaction.update(actionRef, update);

    const event = createAuditEvent({
      eventId: options.eventId,
      businessId,
      correlationId: options.correlationId,
      action: "tool_io.retention_redact",
      actor: options.actor,
      subject: { type: "agent_action", id: actionRef.id },
      providerIds: providerIdsFrom(data),
      result: "success",
      occurredAt: now,
      details: {
        reason: "retention_policy",
        fields: plan.fieldsToDelete,
        skeleton: redactionSkeletonAsJson(plan.skeleton),
      },
    });
    createAuditEventInTransaction(db, transaction, event);
    return "redacted";
  });
}

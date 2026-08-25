export type AuditJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly AuditJsonValue[]
  | { readonly [key: string]: AuditJsonValue };

export type AuditAction =
  | "appointment.lookup"
  | "appointment.cancel"
  | "call.delete"
  | "call.retention_redact"
  | "tool_io.retention_redact";

export type AuditResult = "success" | "failed" | "denied" | "skipped";

export interface AuditActor {
  readonly type: "user" | "system" | "provider";
  readonly id: string;
}

interface AuditSubject {
  readonly type: "call" | "agent_action" | "appointment";
  readonly id: string;
}

export interface AuditProviderIds {
  readonly vapiCallId?: string;
  readonly vapiToolCallId?: string;
  readonly deliveryId?: string;
  readonly [provider: string]: string | undefined;
}

/**
 * Privacy-safe, append-only event stored under a tenant's auditEvents collection.
 * Every field is readonly so callers cannot treat an emitted event as mutable state.
 */
export interface AuditEvent {
  readonly eventId: string;
  readonly businessId: string;
  readonly correlationId: string;
  readonly action: AuditAction;
  readonly actor: AuditActor;
  readonly subject: AuditSubject;
  readonly providerIds: AuditProviderIds;
  readonly result: AuditResult;
  readonly occurredAt: number;
  readonly details: Readonly<Record<string, AuditJsonValue>>;
}

export interface AuditEventInput extends Omit<AuditEvent, "eventId" | "occurredAt"> {
  readonly eventId?: string;
  readonly occurredAt?: number;
}

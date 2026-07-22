import { createHash } from "node:crypto";
import type { AuditJsonValue } from "./types";
import type { RetentionPolicy } from "./retentionPolicy";
import { retentionCutoff } from "./retentionPolicy";

const TRANSCRIPT_FIELDS = ["messages", "transcript", "summary", "outcomeReason"] as const;
const RECORDING_FIELDS = ["recordingUrl"] as const;
const CALL_IDENTIFIER_FIELDS = [
  "callerPhone",
  "callerName",
  "targetPhone",
  "extractedLead",
  "appointmentId",
  "appointmentRef",
  "leadId",
] as const;
const TOOL_IO_FIELDS = ["input", "output"] as const;

export interface AuditDigest {
  readonly sha256: string;
  readonly byteLength: number;
}

export interface RedactionCategorySkeleton {
  readonly redactedAt: number;
  readonly fields: Readonly<Record<string, AuditDigest>>;
}

export interface CallRedactionSkeleton {
  readonly transcript?: RedactionCategorySkeleton;
  readonly recording?: RedactionCategorySkeleton;
  readonly identifiers?: RedactionCategorySkeleton;
}

export interface CallRedactionPlan {
  readonly fieldsToDelete: readonly string[];
  readonly skeleton: CallRedactionSkeleton;
}

export interface ToolIoRedactionPlan {
  readonly fieldsToDelete: readonly string[];
  readonly skeleton: RedactionCategorySkeleton;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

function stableSerialize(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value));
  return serialized === undefined ? "null" : serialized;
}

export function digestAuditValue(value: unknown): AuditDigest {
  const serialized = stableSerialize(value);
  return Object.freeze({
    sha256: createHash("sha256").update(serialized, "utf8").digest("hex"),
    byteLength: Buffer.byteLength(serialized, "utf8"),
  });
}

export function timestampToMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object") {
    const timestamp = value as { toMillis?: () => number; seconds?: number };
    if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
    if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000;
  }
  return null;
}

function hasSensitiveValue(data: Record<string, unknown>, field: string): boolean {
  return data[field] !== undefined && data[field] !== null;
}

function categorySkeleton(
  data: Record<string, unknown>,
  fields: readonly string[],
  redactedAt: number
): RedactionCategorySkeleton | undefined {
  const present = fields.filter((field) => hasSensitiveValue(data, field));
  if (present.length === 0) return undefined;
  return Object.freeze({
    redactedAt,
    fields: Object.freeze(
      Object.fromEntries(present.map((field) => [field, digestAuditValue(data[field])]))
    ),
  });
}

export function buildCallRedactionPlan(
  data: Record<string, unknown>,
  now: number,
  policy: RetentionPolicy,
  options: { readonly force?: boolean; readonly includeIdentifiers?: boolean } = {}
): CallRedactionPlan | null {
  if (!options.force && data.status === "active") return null;

  const endedAt = timestampToMillis(data.endedAt);
  if (!options.force && endedAt === null) return null;

  const redactTranscript =
    options.force || endedAt! <= retentionCutoff(now, policy.transcriptDays);
  const redactRecording =
    options.force || endedAt! <= retentionCutoff(now, policy.recordingDays);

  const transcript = redactTranscript
    ? categorySkeleton(data, TRANSCRIPT_FIELDS, now)
    : undefined;
  const recording = redactRecording
    ? categorySkeleton(data, RECORDING_FIELDS, now)
    : undefined;
  const identifiers = options.includeIdentifiers
    ? categorySkeleton(data, CALL_IDENTIFIER_FIELDS, now)
    : undefined;

  const fieldsToDelete = [
    ...(transcript ? Object.keys(transcript.fields) : []),
    ...(recording ? Object.keys(recording.fields) : []),
    ...(identifiers ? Object.keys(identifiers.fields) : []),
  ];
  if (fieldsToDelete.length === 0) return null;

  return Object.freeze({
    fieldsToDelete: Object.freeze(fieldsToDelete),
    skeleton: Object.freeze({ transcript, recording, identifiers }),
  });
}

export function buildToolIoRedactionPlan(
  data: Record<string, unknown>,
  now: number,
  policy: RetentionPolicy
): ToolIoRedactionPlan | null {
  const createdAt = timestampToMillis(data.createdAt);
  if (createdAt === null || createdAt > retentionCutoff(now, policy.toolIoDays)) {
    return null;
  }
  const skeleton = categorySkeleton(data, TOOL_IO_FIELDS, now);
  if (!skeleton) return null;
  return Object.freeze({
    fieldsToDelete: Object.freeze(Object.keys(skeleton.fields)),
    skeleton,
  });
}

export function redactionSkeletonAsJson(
  value: CallRedactionSkeleton | RedactionCategorySkeleton
): AuditJsonValue {
  return value as unknown as AuditJsonValue;
}

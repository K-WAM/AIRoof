import {
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/admin";
import type {
  ClaimOperationInput,
  ClaimOperationResult,
  CompleteOperationAttemptInput,
  ListOrphanedPendingOperationsInput,
  OperationAttemptRecord,
  OperationEntityReference,
  OperationFailure,
  OperationLocator,
  OperationRecord,
  StartOperationAttemptInput,
} from "@/types/ops";

const MAX_KIND_LENGTH = 80;
const MAX_REFERENCE_LENGTH = 256;
const MAX_PROVIDER_ID_LENGTH = 512;
const MAX_FAILURE_CODE_LENGTH = 128;
const DEFAULT_RECONCILIATION_LIMIT = 100;
const MAX_RECONCILIATION_LIMIT = 500;

export interface LedgerOptions {
  firestore?: Firestore | null;
  now?: Date;
}

export class OperationLedgerUnavailableError extends Error {
  constructor() {
    super("Firestore is unavailable for the operation ledger");
    this.name = "OperationLedgerUnavailableError";
  }
}

export class InvalidOperationLedgerInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOperationLedgerInputError";
  }
}

export class OperationNotFoundError extends Error {
  constructor(opId: string) {
    super(`Operation ${opId} was not found`);
    this.name = "OperationNotFoundError";
  }
}

export class OperationNotRetryableError extends Error {
  constructor(opId: string) {
    super(`Operation ${opId} is already terminal`);
    this.name = "OperationNotRetryableError";
  }
}

export class OperationAttemptInProgressError extends Error {
  constructor(opId: string) {
    super(`Operation ${opId} already has an attempt in progress`);
    this.name = "OperationAttemptInProgressError";
  }
}

export class OperationAttemptNotFoundError extends Error {
  constructor(attemptId: string) {
    super(`Operation attempt ${attemptId} was not found`);
    this.name = "OperationAttemptNotFoundError";
  }
}

export class OperationAttemptAlreadyCompletedError extends Error {
  constructor(attemptId: string) {
    super(`Operation attempt ${attemptId} is already completed`);
    this.name = "OperationAttemptAlreadyCompletedError";
  }
}

function requireFirestore(firestore: Firestore | null | undefined): Firestore {
  const resolved = firestore === undefined ? getAdminFirestore() : firestore;
  if (!resolved) throw new OperationLedgerUnavailableError();
  return resolved;
}

function timestamp(options: LedgerOptions): Timestamp {
  const value = options.now ?? new Date();
  if (Number.isNaN(value.getTime())) {
    throw new InvalidOperationLedgerInputError("now must be a valid date");
  }
  return Timestamp.fromDate(value);
}

function validateDocumentId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.includes("/") || /^__.*__$/.test(normalized)) {
    throw new InvalidOperationLedgerInputError(`${label} is not a valid Firestore document ID`);
  }
  return normalized;
}

function validateBoundedValue(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\r\n\0]/.test(normalized)) {
    throw new InvalidOperationLedgerInputError(`${label} is invalid`);
  }
  return normalized;
}

function validateCodeValue(value: string, label: string, maxLength: number): string {
  const normalized = validateBoundedValue(value, label, maxLength);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)) {
    throw new InvalidOperationLedgerInputError(`${label} must be a non-PII code`);
  }
  return normalized;
}

function validateFailureClassification(
  value: OperationFailure["classification"]
): OperationFailure["classification"] {
  if (value !== "retryable" && value !== "terminal") {
    throw new InvalidOperationLedgerInputError("failure.classification is invalid");
  }
  return value;
}

function validateEntityReference(
  entityRef: OperationEntityReference | undefined
): OperationEntityReference | undefined {
  if (!entityRef) return undefined;
  return {
    collection: validateCodeValue(
      entityRef.collection,
      "entityRef.collection",
      MAX_REFERENCE_LENGTH
    ),
    id: validateBoundedValue(entityRef.id, "entityRef.id", MAX_REFERENCE_LENGTH),
  };
}

function operationRef(
  firestore: Firestore,
  locator: OperationLocator
): DocumentReference<OperationRecord> {
  const businessId = validateDocumentId(locator.businessId, "businessId");
  const opId = validateDocumentId(locator.opId, "opId");
  return firestore
    .collection("businesses")
    .doc(businessId)
    .collection("operations")
    .doc(opId) as DocumentReference<OperationRecord>;
}

function operationFromSnapshot(
  snapshot: DocumentSnapshot<OperationRecord>
): OperationRecord {
  const data = snapshot.data();
  if (!snapshot.exists || !data) throw new OperationNotFoundError(snapshot.id);
  return data;
}

function encodeOperationIdSegment(value: string, label: string): string {
  return encodeURIComponent(validateBoundedValue(value, label, MAX_REFERENCE_LENGTH));
}

/**
 * Stable Vapi operation ID. `occurrence` is one-based so a retried webhook derives
 * the same ID for the same ordered tool call instead of creating another effect.
 */
export function createVapiOperationId(
  callId: string,
  toolName: string,
  occurrence = 1
): string {
  if (!Number.isSafeInteger(occurrence) || occurrence < 1) {
    throw new InvalidOperationLedgerInputError("occurrence must be a positive integer");
  }
  return `vapi:${encodeOperationIdSegment(callId, "callId")}:${encodeOperationIdSegment(
    toolName,
    "toolName"
  )}:${occurrence}`;
}

/** Stable operation ID for one logical email type and entity. */
export function createEmailOperationId(messageType: string, entityId: string): string {
  return `email:${encodeOperationIdSegment(
    messageType,
    "messageType"
  )}:${encodeOperationIdSegment(entityId, "entityId")}`;
}

/**
 * Atomically creates a tenant-scoped operation. A duplicate returns
 * `claimed: false`; callers must execute the side effect only when it is true.
 */
export async function claimOperation(
  input: ClaimOperationInput,
  options: LedgerOptions = {}
): Promise<ClaimOperationResult> {
  const firestore = requireFirestore(options.firestore);
  const ref = operationRef(firestore, input);
  const claimedAt = timestamp(options);
  const kind = validateCodeValue(input.kind, "kind", MAX_KIND_LENGTH);
  const entityRef = validateEntityReference(input.entityRef);

  return firestore.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      return { claimed: false, operation: operationFromSnapshot(existing) };
    }

    const operation: OperationRecord = {
      opId: ref.id,
      kind,
      state: "pending",
      ...(entityRef ? { entityRef } : {}),
      claimedAt,
      updatedAt: claimedAt,
      attemptCount: 0,
    };
    transaction.create(ref, operation);
    return { claimed: true, operation };
  });
}

export async function getOperation(
  locator: OperationLocator,
  options: LedgerOptions = {}
): Promise<OperationRecord | null> {
  const firestore = requireFirestore(options.firestore);
  const snapshot = await operationRef(firestore, locator).get();
  return snapshot.exists ? operationFromSnapshot(snapshot) : null;
}

export async function startOperationAttempt(
  input: StartOperationAttemptInput,
  options: LedgerOptions = {}
): Promise<OperationAttemptRecord> {
  const firestore = requireFirestore(options.firestore);
  const ref = operationRef(firestore, input);
  const startedAt = timestamp(options);

  return firestore.runTransaction(async (transaction) => {
    const operation = operationFromSnapshot(await transaction.get(ref));
    if (
      operation.state === "succeeded" ||
      (operation.state === "failed" && operation.lastFailure?.classification === "terminal")
    ) {
      throw new OperationNotRetryableError(input.opId);
    }
    if (operation.state === "pending" && operation.attemptCount > 0) {
      throw new OperationAttemptInProgressError(input.opId);
    }

    const attemptNumber = operation.attemptCount + 1;
    const attemptId = String(attemptNumber).padStart(6, "0");
    const attemptRef = ref.collection("attempts").doc(attemptId);
    const attempt: OperationAttemptRecord = {
      attemptId,
      attemptNumber,
      state: "pending",
      startedAt,
      updatedAt: startedAt,
    };

    transaction.create(attemptRef, attempt);
    transaction.update(ref, {
      state: "pending",
      attemptCount: attemptNumber,
      updatedAt: startedAt,
    });
    return attempt;
  });
}

/**
 * Retry classification contract:
 *
 * - `retryable` means the provider definitively did not complete the effect and
 *   another attempt is safe (timeouts are retryable only when the provider gives
 *   an idempotency guarantee or confirms non-delivery).
 * - `terminal` means retrying cannot succeed without changing the request, such
 *   as invalid input or a permanent recipient rejection.
 * - An ambiguous timeout or lost response must not be marked failed. Leave the
 *   attempt `pending`; `listOrphanedPendingOperations` surfaces it for provider
 *   reconciliation so a duplicate effect is never guessed into existence.
 */
export async function completeOperationAttempt(
  input: CompleteOperationAttemptInput,
  options: LedgerOptions = {}
): Promise<OperationAttemptRecord> {
  const firestore = requireFirestore(options.firestore);
  const ref = operationRef(firestore, input);
  const attemptId = validateDocumentId(input.attemptId, "attemptId");
  const attemptRef = ref.collection("attempts").doc(attemptId);
  const completedAt = timestamp(options);

  const providerId =
    input.state === "succeeded" && input.providerId !== undefined
      ? validateBoundedValue(input.providerId, "providerId", MAX_PROVIDER_ID_LENGTH)
      : undefined;
  const failure: OperationFailure | undefined =
    input.state === "failed"
      ? {
          classification: validateFailureClassification(input.failure.classification),
          code: validateCodeValue(
            input.failure.code,
            "failure.code",
            MAX_FAILURE_CODE_LENGTH
          ),
        }
      : undefined;

  return firestore.runTransaction(async (transaction) => {
    const [operationSnapshot, attemptSnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(attemptRef),
    ]);
    operationFromSnapshot(operationSnapshot);
    const currentAttempt = attemptSnapshot.data() as OperationAttemptRecord | undefined;
    if (!attemptSnapshot.exists || !currentAttempt) {
      throw new OperationAttemptNotFoundError(attemptId);
    }
    if (currentAttempt.state !== "pending") {
      const sameResult =
        currentAttempt.state === input.state &&
        (input.state === "succeeded"
          ? currentAttempt.providerId === providerId
          : currentAttempt.failure?.classification === failure?.classification &&
            currentAttempt.failure?.code === failure?.code);
      if (sameResult) return currentAttempt;
      throw new OperationAttemptAlreadyCompletedError(attemptId);
    }

    const completedAttempt: OperationAttemptRecord = {
      ...currentAttempt,
      state: input.state,
      updatedAt: completedAt,
      completedAt,
      ...(providerId ? { providerId } : {}),
      ...(failure ? { failure } : {}),
    };
    transaction.set(attemptRef, completedAttempt);

    if (input.state === "succeeded") {
      transaction.update(ref, {
        state: "succeeded",
        updatedAt: completedAt,
        completedAt,
        ...(providerId ? { lastProviderId: providerId } : {}),
      });
    } else {
      transaction.update(ref, {
        state: "failed",
        updatedAt: completedAt,
        lastFailure: failure,
        ...(failure?.classification === "terminal" ? { completedAt } : {}),
      });
    }
    return completedAttempt;
  });
}

export async function listOperationAttempts(
  locator: OperationLocator,
  options: LedgerOptions = {}
): Promise<OperationAttemptRecord[]> {
  const firestore = requireFirestore(options.firestore);
  const snapshot = await operationRef(firestore, locator)
    .collection("attempts")
    .orderBy("attemptNumber", "asc")
    .get();
  return snapshot.docs.map((document) => document.data() as OperationAttemptRecord);
}

export async function listOrphanedPendingOperations(
  input: ListOrphanedPendingOperationsInput,
  options: LedgerOptions = {}
): Promise<OperationRecord[]> {
  if (!Number.isFinite(input.pendingTtlMs) || input.pendingTtlMs <= 0) {
    throw new InvalidOperationLedgerInputError("pendingTtlMs must be greater than zero");
  }
  const requestedLimit = input.limit ?? DEFAULT_RECONCILIATION_LIMIT;
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
    throw new InvalidOperationLedgerInputError("limit must be a positive integer");
  }

  const firestore = requireFirestore(options.firestore);
  const businessId = validateDocumentId(input.businessId, "businessId");
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new InvalidOperationLedgerInputError("now must be a valid date");
  }
  const cutoff = Timestamp.fromMillis(now.getTime() - input.pendingTtlMs);
  const snapshot = await firestore
    .collection("businesses")
    .doc(businessId)
    .collection("operations")
    .where("state", "==", "pending")
    .where("updatedAt", "<=", cutoff)
    .orderBy("updatedAt", "asc")
    .limit(Math.min(requestedLimit, MAX_RECONCILIATION_LIMIT))
    .get();

  return snapshot.docs.map((document) => document.data() as OperationRecord);
}

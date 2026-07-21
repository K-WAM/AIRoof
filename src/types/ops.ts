import type { Timestamp } from "firebase-admin/firestore";

export type OperationState = "pending" | "succeeded" | "failed";

export type OperationFailureClassification = "retryable" | "terminal";

export interface OperationEntityReference {
  collection: string;
  id: string;
}

export interface OperationFailure {
  classification: OperationFailureClassification;
  code: string;
}

export interface OperationRecord {
  opId: string;
  kind: string;
  state: OperationState;
  entityRef?: OperationEntityReference;
  claimedAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
  attemptCount: number;
  lastProviderId?: string;
  lastFailure?: OperationFailure;
}

export interface OperationAttemptRecord {
  attemptId: string;
  attemptNumber: number;
  state: OperationState;
  startedAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
  providerId?: string;
  failure?: OperationFailure;
}

export interface ClaimOperationInput {
  businessId: string;
  opId: string;
  kind: string;
  entityRef?: OperationEntityReference;
}

export type ClaimOperationResult =
  | { claimed: true; operation: OperationRecord }
  | { claimed: false; operation: OperationRecord };

export interface OperationLocator {
  businessId: string;
  opId: string;
}

export type StartOperationAttemptInput = OperationLocator;

export type CompleteOperationAttemptInput = OperationLocator &
  { attemptId: string } &
  (
    | { state: "succeeded"; providerId?: string }
    | { state: "failed"; failure: OperationFailure }
  );

export interface ListOrphanedPendingOperationsInput {
  businessId: string;
  pendingTtlMs: number;
  limit?: number;
}

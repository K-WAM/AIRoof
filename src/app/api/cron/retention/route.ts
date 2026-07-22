import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import type {
  DocumentData,
  DocumentSnapshot,
  Query,
} from "firebase-admin/firestore";
import { requireCronAuth } from "@/lib/auth/cronGuard";
import { getAdminFirestore } from "@/lib/firebase/admin";
import {
  getRetentionPolicy,
  redactCallDocument,
  redactToolIoDocument,
  retentionCutoff,
  timestampToMillis,
} from "@/lib/audit";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 250;

type RetentionPhase = "calls" | "toolIo";

interface RetentionCursor {
  readonly phase: RetentionPhase;
  readonly timestamp?: number;
  readonly documentId?: string;
}

interface RetentionRequest {
  readonly businessId?: unknown;
  readonly batchSize?: unknown;
  readonly cursor?: unknown;
}

function parseBatchSize(value: unknown): number {
  if (value === undefined) return DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_BATCH_SIZE) {
    throw new Error(`batchSize must be an integer from 1 to ${MAX_BATCH_SIZE}`);
  }
  return value as number;
}

function encodeCursor(cursor: RetentionCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: unknown): RetentionCursor | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("cursor must be a string");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("cursor is invalid");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("cursor is invalid");
  const candidate = parsed as Record<string, unknown>;
  if (candidate.phase !== "calls" && candidate.phase !== "toolIo") {
    throw new Error("cursor is invalid");
  }
  const hasPosition = candidate.timestamp !== undefined || candidate.documentId !== undefined;
  if (
    hasPosition &&
    (!Number.isFinite(candidate.timestamp) ||
      typeof candidate.documentId !== "string" ||
      candidate.documentId.length === 0)
  ) {
    throw new Error("cursor is invalid");
  }
  return {
    phase: candidate.phase,
    ...(hasPosition
      ? {
          timestamp: candidate.timestamp as number,
          documentId: candidate.documentId as string,
        }
      : {}),
  };
}

function positionedQuery(
  query: Query<DocumentData>,
  cursor: RetentionCursor | null,
  phase: RetentionPhase
): Query<DocumentData> {
  if (
    cursor?.phase === phase &&
    cursor.timestamp !== undefined &&
    cursor.documentId !== undefined
  ) {
    return query.startAfter(cursor.timestamp, cursor.documentId);
  }
  return query;
}

function cursorFor(
  phase: RetentionPhase,
  snapshot: DocumentSnapshot<DocumentData>,
  timestampField: string
): RetentionCursor {
  const timestamp = timestampToMillis(snapshot.data()?.[timestampField]);
  if (timestamp === null) throw new Error(`Retention cursor field ${timestampField} is invalid`);
  return { phase, timestamp, documentId: snapshot.id };
}

export async function POST(request: NextRequest) {
  // Authentication must happen before parsing work or touching Firestore.
  const authError = requireCronAuth(request);
  if (authError) return authError;

  let body: RetentionRequest;
  let batchSize: number;
  let cursor: RetentionCursor | null;
  try {
    body = (await request.json()) as RetentionRequest;
    batchSize = parseBatchSize(body.batchSize);
    cursor = decodeCursor(body.cursor);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 }
    );
  }

  const businessId =
    typeof body.businessId === "string" ? body.businessId.trim() : "";
  if (!businessId) {
    return NextResponse.json({ error: "Missing required field: businessId" }, { status: 400 });
  }

  let policy;
  try {
    policy = getRetentionPolicy();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid retention policy" },
      { status: 500 }
    );
  }

  const db = getAdminFirestore();
  if (!db) {
    return NextResponse.json({ error: "Firestore not available" }, { status: 500 });
  }

  try {
    const businessRef = db.collection("businesses").doc(businessId);
    const businessSnapshot = await businessRef.get();
    if (!businessSnapshot.exists) {
      return NextResponse.json(
        { error: `Business ${businessId} not found` },
        { status: 404 }
      );
    }

    const now = Date.now();
    const correlationId = `retention_${now}_${randomUUID()}`;
    const actor = { type: "system" as const, id: "retention-cron" };
    let remaining = batchSize;
    let scanned = 0;
    let redactedCalls = 0;
    let redactedToolActions = 0;
    let nextCursor: RetentionCursor | null = null;

    if (!cursor || cursor.phase === "calls") {
      const newestCallCutoff = Math.max(
        retentionCutoff(now, policy.transcriptDays),
        retentionCutoff(now, policy.recordingDays)
      );
      const baseCallsQuery = businessRef
        .collection("calls")
        .where("endedAt", "<=", newestCallCutoff)
        .orderBy("endedAt", "asc")
        .orderBy(FieldPath.documentId(), "asc");
      const callQuery = positionedQuery(baseCallsQuery, cursor, "calls").limit(remaining + 1);
      const callSnapshot = await callQuery.get();
      const callDocs = callSnapshot.docs.slice(0, remaining);

      for (const callDoc of callDocs) {
        const outcome = await redactCallDocument(
          db,
          businessId,
          callDoc.ref,
          policy,
          now,
          {
            action: "call.retention_redact",
            actor,
            correlationId,
            eventId: `${correlationId}_call_${callDoc.id}`,
            force: false,
            includeIdentifiers: false,
            reason: "retention_policy",
          }
        );
        scanned += 1;
        remaining -= 1;
        if (outcome === "redacted") redactedCalls += 1;
      }

      if (callSnapshot.docs.length > callDocs.length && callDocs.length > 0) {
        nextCursor = cursorFor("calls", callDocs.at(-1)!, "endedAt");
      } else if (remaining === 0) {
        nextCursor = { phase: "toolIo" };
      }
    }

    if (!nextCursor && remaining > 0) {
      const baseToolQuery = businessRef
        .collection("agentActions")
        .where("createdAt", "<=", retentionCutoff(now, policy.toolIoDays))
        .orderBy("createdAt", "asc")
        .orderBy(FieldPath.documentId(), "asc");
      const toolCursor = cursor?.phase === "toolIo" ? cursor : null;
      const toolQuery = positionedQuery(baseToolQuery, toolCursor, "toolIo").limit(remaining + 1);
      const toolSnapshot = await toolQuery.get();
      const toolDocs = toolSnapshot.docs.slice(0, remaining);

      for (const actionDoc of toolDocs) {
        const outcome = await redactToolIoDocument(
          db,
          businessId,
          actionDoc.ref,
          policy,
          now,
          {
            actor,
            correlationId,
            eventId: `${correlationId}_tool_${actionDoc.id}`,
          }
        );
        scanned += 1;
        remaining -= 1;
        if (outcome === "redacted") redactedToolActions += 1;
      }

      if (toolSnapshot.docs.length > toolDocs.length && toolDocs.length > 0) {
        nextCursor = cursorFor("toolIo", toolDocs.at(-1)!, "createdAt");
      }
    }

    return NextResponse.json({
      success: true,
      businessId,
      correlationId,
      scanned,
      redactedCalls,
      redactedToolActions,
      nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
      policy,
    });
  } catch (error) {
    console.error("POST /api/cron/retention error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { sendCrewAssignment } from "@/lib/notify";
import {
  DEFAULT_SCHEDULE_DURATION_MS,
  isScheduleWithinBusinessHours,
  runLedgeredEmail,
  scheduleBucketStarts,
  scheduleLockId,
  scheduleRangesOverlap,
  scheduleResourceKey,
  SchedulingConflictError,
  type NotificationDeliveryState,
} from "@/lib/tools/agentTools";
import type { Crew } from "@/types/library";

interface AssignmentBody {
  businessId?: string;
  crewId?: string | null;
  scheduledStart?: number | null;
  scheduledEnd?: number | null;
  crewConfirmed?: boolean;
  notify?: boolean;
}

function schedulingError(error: unknown): NextResponse | null {
  if (!(error instanceof SchedulingConflictError)) return null;
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.code === "invalid_schedule" ? 400 : 409 }
  );
}

// POST /api/jobs/[jobId]/assign
// Persists the schedule atomically. Notification is a separate, ledgered effect.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  let body: AssignmentBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const {
    businessId,
    crewId,
    scheduledStart,
    scheduledEnd,
    crewConfirmed,
    notify,
  } = body;
  if (!businessId || crewId === undefined) {
    return NextResponse.json(
      { error: "businessId and crewId are required" },
      { status: 400 }
    );
  }
  if (
    (scheduledStart !== undefined &&
      scheduledStart !== null &&
      !Number.isFinite(scheduledStart)) ||
    (scheduledEnd !== undefined && scheduledEnd !== null && !Number.isFinite(scheduledEnd))
  ) {
    return NextResponse.json(
      { error: "scheduledStart and scheduledEnd must be timestamps" },
      { status: 400 }
    );
  }

  const gate = await verifyAuthAndRole(req, businessId, [
    "owner",
    "staff",
    "superadmin",
  ]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const businessRef = db.collection("businesses").doc(businessId);
  const jobRef = businessRef.collection("jobs").doc(jobId);
  let committed:
    | {
        job: Record<string, unknown>;
        crew: Crew | null;
        business: Record<string, unknown>;
        startTime: number | null;
        endTime: number | null;
      }
    | undefined;

  try {
    committed = await db.runTransaction(async (transaction) => {
      const [jobSnapshot, businessSnapshot] = await Promise.all([
        transaction.get(jobRef),
        transaction.get(businessRef),
      ]);
      if (!jobSnapshot.exists) throw new Error("JOB_NOT_FOUND");
      if (!businessSnapshot.exists) throw new Error("BUSINESS_NOT_FOUND");
      const job = jobSnapshot.data() ?? {};
      const business = businessSnapshot.data() ?? {};
      const previousCrewId =
        typeof job.assignedCrewId === "string" ? job.assignedCrewId : null;
      const previousStart =
        typeof job.scheduledStart === "number" ? job.scheduledStart : null;
      const previousEnd = typeof job.scheduledEnd === "number" ? job.scheduledEnd : null;

      const previousLockRefs =
        previousCrewId && previousStart !== null && previousEnd !== null
          ? scheduleBucketStarts(previousStart, previousEnd).map((bucket) =>
              businessRef
                .collection("schedulingLocks")
                .doc(scheduleLockId(scheduleResourceKey(previousCrewId), bucket))
            )
          : [];

      if (crewId === null) {
        const previousLocks = await Promise.all(
          previousLockRefs.map((reference) => transaction.get(reference))
        );
        for (const snapshot of previousLocks) {
          if (snapshot.exists && snapshot.data()?.entityId === jobId) {
            transaction.delete(snapshot.ref);
          }
        }
        transaction.update(jobRef, {
          assignedCrewId: null,
          scheduledStart: null,
          scheduledEnd: null,
          crewConfirmed: false,
          updatedAt: Date.now(),
        });
        return {
          job,
          crew: null,
          business,
          startTime: null,
          endTime: null,
        };
      }

      const start = scheduledStart ?? previousStart;
      const previousDuration =
        previousStart !== null && previousEnd !== null
          ? previousEnd - previousStart
          : DEFAULT_SCHEDULE_DURATION_MS;
      const end = scheduledEnd ??
        (start === null ? null : start + Math.max(previousDuration, 1));
      if (start === null || end === null || end <= start) {
        throw new SchedulingConflictError(
          "invalid_schedule",
          "Choose a valid start and end time before assigning this crew."
        );
      }

      const crewRef = businessRef.collection("crews").doc(crewId);
      const crewSnapshot = await transaction.get(crewRef);
      if (!crewSnapshot.exists) throw new Error("CREW_NOT_FOUND");
      const crew = crewSnapshot.data() as Crew;
      const timeZone =
        typeof business.timezone === "string"
          ? business.timezone
          : "America/New_York";
      if (!isScheduleWithinBusinessHours(start, end, business.businessHours, timeZone)) {
        throw new SchedulingConflictError(
          "outside_business_hours",
          "That assignment falls outside the business's configured hours."
        );
      }

      const resourceKey = scheduleResourceKey(crewId);
      const lockBuckets = scheduleBucketStarts(start, end);
      const lockRefs = lockBuckets.map((bucket) =>
        businessRef
          .collection("schedulingLocks")
          .doc(scheduleLockId(resourceKey, bucket))
      );
      const jobsQuery = businessRef.collection("jobs").where("assignedCrewId", "==", crewId);
      const appointmentsQuery = businessRef
        .collection("appointments")
        .where("assignedCrewId", "==", crewId);
      const [newLocks, oldLocks, jobsSnapshot, appointmentsSnapshot] = await Promise.all([
        Promise.all(lockRefs.map((reference) => transaction.get(reference))),
        Promise.all(previousLockRefs.map((reference) => transaction.get(reference))),
        transaction.get(jobsQuery),
        transaction.get(appointmentsQuery),
      ]);
      const lockConflict = newLocks.some(
        (snapshot) => snapshot.exists && snapshot.data()?.entityId !== jobId
      );
      const jobConflict = jobsSnapshot.docs.some((document) => {
        if (document.id === jobId) return false;
        const candidate = document.data();
        return (
          typeof candidate.scheduledStart === "number" &&
          typeof candidate.scheduledEnd === "number" &&
          scheduleRangesOverlap(
            start,
            end,
            candidate.scheduledStart,
            candidate.scheduledEnd
          )
        );
      });
      const appointmentConflict = appointmentsSnapshot.docs.some((document) => {
        const candidate = document.data();
        return (
          candidate.status !== "cancelled" &&
          typeof candidate.startTime === "number" &&
          typeof candidate.endTime === "number" &&
          scheduleRangesOverlap(start, end, candidate.startTime, candidate.endTime)
        );
      });
      if (lockConflict || jobConflict || appointmentConflict) {
        throw new SchedulingConflictError(
          "slot_conflict",
          "That crew is already assigned during this time. Choose another crew or slot."
        );
      }

      const newPaths = new Set(lockRefs.map((reference) => reference.path));
      for (const snapshot of oldLocks) {
        if (
          snapshot.exists &&
          snapshot.data()?.entityId === jobId &&
          !newPaths.has(snapshot.ref.path)
        ) {
          transaction.delete(snapshot.ref);
        }
      }
      const now = Date.now();
      for (const [index, lockRef] of lockRefs.entries()) {
        transaction.set(lockRef, {
          resourceKey,
          bucketStart: lockBuckets[index],
          entityType: "job",
          entityId: jobId,
          startTime: start,
          endTime: end,
          updatedAt: now,
        });
      }
      transaction.update(jobRef, {
        assignedCrewId: crewId,
        scheduledStart: start,
        scheduledEnd: end,
        crewConfirmed: crewConfirmed ?? true,
        updatedAt: now,
      });
      return { job, crew, business, startTime: start, endTime: end };
    });
  } catch (error) {
    const conflict = schedulingError(error);
    if (conflict) return conflict;
    if (error instanceof Error && error.message === "JOB_NOT_FOUND") {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "CREW_NOT_FOUND") {
      return NextResponse.json({ error: "Crew not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "BUSINESS_NOT_FOUND") {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }
    console.error("Crew assignment failed:", error);
    return NextResponse.json({ error: "Could not save the crew assignment" }, { status: 500 });
  }

  let notificationStatus: NotificationDeliveryState = "unconfigured";
  const shouldNotify = crewId !== null && notify !== false && (crewConfirmed ?? true);
  if (shouldNotify && committed?.crew?.email && committed.startTime !== null) {
    const { crew, job, business, startTime } = committed;
    const timeZone =
      typeof business.timezone === "string"
        ? business.timezone
        : "America/New_York";
    const when = new Date(startTime).toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
    try {
      notificationStatus = await runLedgeredEmail({
        firestore: db,
        businessId,
        messageType: "crew-assignment",
        entityId: `${jobId}:${startTime}`,
        entityRef: { collection: "jobs", id: jobId },
        send: () =>
          sendCrewAssignment({
            to: crew.email!,
            brand: {
              businessName:
                typeof business.businessName === "string"
                  ? business.businessName
                  : "Your Company",
              brandColor:
                typeof business.brandColor === "string" ? business.brandColor : undefined,
              logoUrl: typeof business.logoUrl === "string" ? business.logoUrl : undefined,
              contactPhone:
                typeof business.contactPhone === "string"
                  ? business.contactPhone
                  : undefined,
              contactEmail:
                typeof business.contactEmail === "string"
                  ? business.contactEmail
                  : undefined,
            },
            crewName: crew.name,
            jobTitle: typeof job.title === "string" ? job.title : jobId,
            address: typeof job.address === "string" ? job.address : undefined,
            clientName:
              typeof job.clientName === "string" ? job.clientName : undefined,
            when,
            scope:
              typeof job.serviceType === "string" ? job.serviceType : undefined,
          }),
      });
    } catch (error) {
      console.error("Crew notification ledger failed after assignment persisted:", error);
      notificationStatus = "failed";
    }
  }

  return NextResponse.json({
    ok: true,
    emailed: notificationStatus === "delivered",
    notificationStatus,
  });
}

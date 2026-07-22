import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { buildCustomerConfirmationEmail } from "@/lib/notify";
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

interface AppointmentPatchBody {
  businessId?: string;
  assignedCrewId?: string | null;
  startTime?: number | null;
  confirm?: boolean;
  notifyCustomer?: boolean;
}

function schedulingError(error: unknown): NextResponse | null {
  if (!(error instanceof SchedulingConflictError)) return null;
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.code === "invalid_schedule" ? 400 : 409 }
  );
}

// PATCH /api/appointments/[appointmentId] — atomically assign/move/confirm.
// Customer notification runs afterward through the T-021 operation ledger.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const { appointmentId } = await params;
  let body: AppointmentPatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { businessId, assignedCrewId, startTime, confirm, notifyCustomer } = body;
  if (!businessId) {
    return NextResponse.json({ error: "businessId required" }, { status: 400 });
  }
  if (startTime !== undefined && startTime !== null && !Number.isFinite(startTime)) {
    return NextResponse.json({ error: "startTime must be a timestamp" }, { status: 400 });
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
  const appointmentRef = businessRef.collection("appointments").doc(appointmentId);
  let committed:
    | {
        appointment: Record<string, unknown>;
        business: Record<string, unknown>;
        startTime: number;
        endTime: number;
      }
    | undefined;

  try {
    committed = await db.runTransaction(async (transaction) => {
      const [appointmentSnapshot, businessSnapshot] = await Promise.all([
        transaction.get(appointmentRef),
        transaction.get(businessRef),
      ]);
      if (!appointmentSnapshot.exists) throw new Error("APPOINTMENT_NOT_FOUND");
      if (!businessSnapshot.exists) throw new Error("BUSINESS_NOT_FOUND");
      const appointment = appointmentSnapshot.data() ?? {};
      const business = businessSnapshot.data() ?? {};
      if (appointment.status === "cancelled") {
        throw new SchedulingConflictError(
          "invalid_schedule",
          "Cancelled appointments cannot be moved or assigned."
        );
      }

      const previousStart = Number(appointment.startTime);
      const previousEnd = Number(appointment.endTime);
      const previousCrewId =
        typeof appointment.assignedCrewId === "string"
          ? appointment.assignedCrewId
          : null;
      const duration =
        Number.isFinite(previousEnd - previousStart) && previousEnd > previousStart
          ? previousEnd - previousStart
          : DEFAULT_SCHEDULE_DURATION_MS;
      const desiredStart = startTime ?? previousStart;
      const desiredEnd = desiredStart + duration;
      const desiredCrewId =
        assignedCrewId === undefined ? previousCrewId : assignedCrewId;
      if (!Number.isFinite(desiredStart) || !Number.isFinite(desiredEnd)) {
        throw new SchedulingConflictError(
          "invalid_schedule",
          "The appointment has an invalid start or end time."
        );
      }

      if (desiredCrewId) {
        const crewSnapshot = await transaction.get(
          businessRef.collection("crews").doc(desiredCrewId)
        );
        if (!crewSnapshot.exists) throw new Error("CREW_NOT_FOUND");
      }
      const timeZone =
        typeof business.timezone === "string"
          ? business.timezone
          : "America/New_York";
      if (
        !isScheduleWithinBusinessHours(
          desiredStart,
          desiredEnd,
          business.businessHours,
          timeZone
        )
      ) {
        throw new SchedulingConflictError(
          "outside_business_hours",
          "That appointment falls outside the business's configured hours."
        );
      }

      const oldResourceKey = scheduleResourceKey(previousCrewId);
      const newResourceKey = scheduleResourceKey(desiredCrewId);
      const oldLockRefs = scheduleBucketStarts(previousStart, previousEnd).map((bucket) =>
        businessRef
          .collection("schedulingLocks")
          .doc(scheduleLockId(oldResourceKey, bucket))
      );
      const newBuckets = scheduleBucketStarts(desiredStart, desiredEnd);
      const newLockRefs = newBuckets.map((bucket) =>
        businessRef
          .collection("schedulingLocks")
          .doc(scheduleLockId(newResourceKey, bucket))
      );
      const appointmentsQuery = desiredCrewId
        ? businessRef
            .collection("appointments")
            .where("assignedCrewId", "==", desiredCrewId)
        : businessRef.collection("appointments").where("startTime", "<", desiredEnd);
      const jobsQuery = desiredCrewId
        ? businessRef.collection("jobs").where("assignedCrewId", "==", desiredCrewId)
        : null;
      const [newLocks, oldLocks, appointmentsSnapshot, jobsSnapshot] = await Promise.all([
        Promise.all(newLockRefs.map((reference) => transaction.get(reference))),
        Promise.all(oldLockRefs.map((reference) => transaction.get(reference))),
        transaction.get(appointmentsQuery),
        jobsQuery ? transaction.get(jobsQuery) : Promise.resolve(null),
      ]);
      const lockConflict = newLocks.some(
        (snapshot) => snapshot.exists && snapshot.data()?.entityId !== appointmentId
      );
      const appointmentConflict = appointmentsSnapshot.docs.some((document) => {
        if (document.id === appointmentId) return false;
        const candidate = document.data();
        const sameResource = desiredCrewId
          ? candidate.assignedCrewId === desiredCrewId
          : !candidate.assignedCrewId;
        return (
          sameResource &&
          candidate.status !== "cancelled" &&
          typeof candidate.startTime === "number" &&
          typeof candidate.endTime === "number" &&
          scheduleRangesOverlap(
            desiredStart,
            desiredEnd,
            candidate.startTime,
            candidate.endTime
          )
        );
      });
      const jobConflict =
        jobsSnapshot?.docs.some((document) => {
          const candidate = document.data();
          return (
            typeof candidate.scheduledStart === "number" &&
            typeof candidate.scheduledEnd === "number" &&
            scheduleRangesOverlap(
              desiredStart,
              desiredEnd,
              candidate.scheduledStart,
              candidate.scheduledEnd
            )
          );
        }) ?? false;
      if (lockConflict || appointmentConflict || jobConflict) {
        throw new SchedulingConflictError(
          "slot_conflict",
          desiredCrewId
            ? "That provider is already booked during this time. Choose another provider or slot."
            : "That requested time was just taken. Choose another opening."
        );
      }

      const newPaths = new Set(newLockRefs.map((reference) => reference.path));
      for (const snapshot of oldLocks) {
        if (
          snapshot.exists &&
          snapshot.data()?.entityId === appointmentId &&
          !newPaths.has(snapshot.ref.path)
        ) {
          transaction.delete(snapshot.ref);
        }
      }
      const now = Date.now();
      for (const [index, lockRef] of newLockRefs.entries()) {
        transaction.set(lockRef, {
          resourceKey: newResourceKey,
          bucketStart: newBuckets[index],
          entityType: "appointment",
          entityId: appointmentId,
          startTime: desiredStart,
          endTime: desiredEnd,
          updatedAt: now,
        });
      }
      const update: Record<string, unknown> = {
        assignedCrewId: desiredCrewId,
        startTime: desiredStart,
        endTime: desiredEnd,
        updatedAt: now,
      };
      if (confirm) {
        update.status = "confirmed";
        update.pendingConfirmation = false;
      } else if (desiredStart !== previousStart) {
        // A changed customer-facing time is a new request until notification is
        // explicitly sent; scheduling persistence never implies delivery.
        update.status = "requested";
        update.pendingConfirmation = true;
      }
      transaction.update(appointmentRef, update);
      return {
        appointment: { ...appointment, ...update },
        business,
        startTime: desiredStart,
        endTime: desiredEnd,
      };
    });
  } catch (error) {
    const conflict = schedulingError(error);
    if (conflict) return conflict;
    if (error instanceof Error && error.message === "APPOINTMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "CREW_NOT_FOUND") {
      return NextResponse.json({ error: "Crew not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "BUSINESS_NOT_FOUND") {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }
    console.error("Appointment update failed:", error);
    return NextResponse.json({ error: "Could not save the appointment" }, { status: 500 });
  }

  let notificationStatus: NotificationDeliveryState = "unconfigured";
  if (notifyCustomer && committed) {
    const { appointment, business, startTime } = committed;
    const callerEmail =
      typeof appointment.callerEmail === "string" ? appointment.callerEmail : null;
    if (callerEmail) {
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
        const brand = {
          businessName:
            typeof business.businessName === "string"
              ? business.businessName
              : "Your Company",
          brandColor:
            typeof business.brandColor === "string"
              ? business.brandColor
              : undefined,
          logoUrl:
            typeof business.logoUrl === "string" ? business.logoUrl : undefined,
          contactPhone:
            typeof business.contactPhone === "string"
              ? business.contactPhone
              : undefined,
          contactEmail:
            typeof business.contactEmail === "string"
              ? business.contactEmail
              : undefined,
        };
        const { subject, html } = buildCustomerConfirmationEmail({
          brand,
          clientName:
            typeof appointment.callerName === "string"
              ? appointment.callerName
              : undefined,
          serviceType:
            typeof appointment.serviceType === "string"
              ? appointment.serviceType
              : undefined,
          when,
          address:
            typeof appointment.address === "string"
              ? appointment.address
              : undefined,
        });
        notificationStatus = await runLedgeredEmail({
          firestore: db,
          businessId,
          messageType: "customer-confirmation",
          entityId: `${appointmentId}:${startTime}`,
          entityRef: { collection: "appointments", id: appointmentId },
          to: callerEmail,
          subject,
          html,
        });
      } catch (error) {
        console.error(
          "Customer notification ledger failed after appointment persisted:",
          error
        );
        notificationStatus = "failed";
      }
    }
  }

  return NextResponse.json({
    ok: true,
    notificationStatus,
    notifiedCustomer: notificationStatus === "delivered",
  });
}

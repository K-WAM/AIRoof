import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { buildCustomerConfirmationEmail } from "@/lib/notify";
import { sendEmail } from "@/lib/comms/send";
import { isSmsEnabled, sendSms } from "@/lib/comms/sms";
import { bookingConfirmed } from "@/lib/comms/smsTemplates";
import { notifyInspector } from "@/lib/crews/inspectorNotify";
import { contactPhone } from "@/lib/format/phone";
import { confirmChannels, type ConfirmChannel } from "@/lib/comms/confirmChannels";
import { buildRequestDeclineEmail, REQUEST_DECLINE_REASONS, type RequestDeclineReason } from "@/lib/comms/requestDeclineEmail";
import {
  DEFAULT_SCHEDULE_DURATION_MS,
  isScheduleWithinBusinessHours,
  runLedgeredEmail,
  releaseAppointmentLocks,
  scheduleCapacityResourceKey,
  scheduleBucketStarts,
  scheduleLockId,
  scheduleRangesOverlap,
  scheduleResourceKey,
  SchedulingConflictError,
  TIME_BLOCK_MAX_MS,
  type NotificationDeliveryState,
} from "@/lib/tools/agentTools";

interface AppointmentPatchBody {
  businessId?: string;
  assignedCrewId?: string | null;
  startTime?: number | null;
  confirm?: boolean;
  notifyCustomer?: boolean;
  /** "auto" (the default) = every channel the caller gave on the call; sms/email/none force one. */
  notifyChannel?: "auto" | "sms" | "email" | "none";
  force?: boolean;
  declineReason?: string;
  customMessage?: string;
}

const NOTIFY_CHANNELS = ["auto", "sms", "email", "none"] as const;

// Phase 31 (T-152): the chosen inspector already has a block or another inspection in this slot. Forceable by the
// office ("assign anyway?"), unlike a genuine capacity/lock conflict.
class InspectorBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InspectorBusyError";
  }
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

  const {
    businessId,
    assignedCrewId,
    startTime,
    confirm,
    notifyCustomer,
    notifyChannel,
    force,
    declineReason,
    customMessage,
  } = body;
  if (!businessId) {
    return NextResponse.json({ error: "businessId required" }, { status: 400 });
  }
  if (startTime !== undefined && startTime !== null && !Number.isFinite(startTime)) {
    return NextResponse.json({ error: "startTime must be a timestamp" }, { status: 400 });
  }
  if (notifyChannel !== undefined && !NOTIFY_CHANNELS.includes(notifyChannel)) {
    return NextResponse.json({ error: "notifyChannel must be auto, sms, email or none" }, { status: 400 });
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

  // T-113: declining is a terminal, idempotent decision, not a scheduling
  // update. Persist before any best-effort email attempt so a retry can never
  // send a second decline.
  if (declineReason !== undefined) {
    if (!REQUEST_DECLINE_REASONS.includes(declineReason as RequestDeclineReason)) {
      return NextResponse.json({ error: "A valid declineReason is required" }, { status: 400 });
    }
    if (typeof customMessage !== "undefined" && (typeof customMessage !== "string" || customMessage.length > 300)) {
      return NextResponse.json({ error: "customMessage must be plain text up to 300 characters" }, { status: 400 });
    }
    const decision = await db.runTransaction(async (transaction) => {
      const [appointmentSnapshot, businessSnapshot] = await Promise.all([
        transaction.get(appointmentRef), transaction.get(businessRef),
      ]);
      if (!appointmentSnapshot.exists) return { missing: "Appointment" } as const;
      if (!businessSnapshot.exists) return { missing: "Business" } as const;
      const appointment = appointmentSnapshot.data() ?? {};
      const business = businessSnapshot.data() ?? {};
      if (appointment.declinedAt) return { alreadyDeclined: true } as const;
      await releaseAppointmentLocks(
        transaction,
        businessRef,
        appointmentId,
        Number(appointment.startTime),
        Number(appointment.endTime),
        typeof appointment.assignedCrewId === "string" ? appointment.assignedCrewId : null,
        typeof appointment.scheduleCapacityUnit === "number" ? appointment.scheduleCapacityUnit : null
      );
      const now = Date.now();
      transaction.update(appointmentRef, { status: "cancelled", pendingConfirmation: false, declinedAt: now, declineReason, decidedBy: gate.user.uid, updatedAt: now });
      return { appointment, business };
    });
    if ("missing" in decision) return NextResponse.json({ error: `${decision.missing} not found` }, { status: 404 });
    if ("alreadyDeclined" in decision) {
      return NextResponse.json({ ok: true, alreadyDeclined: true, notifiedCustomer: false, staffNotified: 0 });
    }
    const { appointment, business } = decision;
    // Phase 31 (T-152): cancel/decline tells the inspector row if one was assigned.
    let staffNotified = 0;
    const declinedCrewId = typeof appointment.assignedCrewId === "string" ? appointment.assignedCrewId : null;
    if (declinedCrewId) {
      const notified = await notifyInspector({
        db,
        businessId,
        appointment: { ...appointment, appointmentId },
        change: "cancelled",
        crewId: declinedCrewId,
      });
      staffNotified = notified.emailed + notified.texted;
    }
    const email = typeof appointment.callerEmail === "string" ? appointment.callerEmail : null;
    if (!email) return NextResponse.json({ ok: true, notifiedCustomer: false, noEmail: true, staffNotified });
    const message = buildRequestDeclineEmail({
      brand: {
        businessName: typeof business.businessName === "string" ? business.businessName : "Your Company",
        brandColor: typeof business.brandColor === "string" ? business.brandColor : null,
        logoUrl: typeof business.logoUrl === "string" ? business.logoUrl : null,
        contactPhone: typeof business.contactPhone === "string" ? business.contactPhone : null,
        contactEmail: typeof business.contactEmail === "string" ? business.contactEmail : null,
      },
      clientName: typeof appointment.callerName === "string" ? appointment.callerName : undefined,
      serviceType: typeof appointment.serviceType === "string" ? appointment.serviceType : undefined,
      reason: declineReason as RequestDeclineReason,
      customMessage: typeof customMessage === "string" ? customMessage : undefined,
    });
    const result = await sendEmail({
      to: email,
      ...message,
      fromName: typeof business.businessName === "string" ? business.businessName : null,
      replyTo: typeof business.contactEmail === "string" ? business.contactEmail : null,
    });
    return NextResponse.json({ ok: true, notifiedCustomer: result.status === "delivered", staffNotified });
  }
  let committed:
    | {
        appointment: Record<string, unknown>;
        business: Record<string, unknown>;
        startTime: number;
        endTime: number;
        previousCrewId: string | null;
        previousStart: number;
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
      const previousCapacityUnit = typeof appointment.scheduleCapacityUnit === "number"
        ? appointment.scheduleCapacityUnit
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

      let targetCrew: Record<string, unknown> | null = null;
      if (desiredCrewId) {
        const crewSnapshot = await transaction.get(
          businessRef.collection("crews").doc(desiredCrewId)
        );
        if (!crewSnapshot.exists) throw new Error("CREW_NOT_FOUND");
        targetCrew = crewSnapshot.data() ?? {};
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

      const oldResourceKey = previousCapacityUnit !== null && !previousCrewId
        ? scheduleCapacityResourceKey(previousCapacityUnit)
        : scheduleResourceKey(previousCrewId);
      const newResourceKey = desiredCrewId
        ? scheduleResourceKey(desiredCrewId)
        : previousCapacityUnit !== null
          ? scheduleCapacityResourceKey(previousCapacityUnit)
          : scheduleResourceKey(null);
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
      // Phase 31 (T-152): the office is warned when it lands this booking on an inspector row that already has a block
      // or another inspection then — unless it sends force ("assign anyway?").
      const crewChanged = desiredCrewId !== previousCrewId;
      const timeChanged = desiredStart !== previousStart;
      const isInspectorTarget = targetCrew?.kind === "inspector";
      const forceInspector = force === true && isInspectorTarget;
      if (isInspectorTarget && (crewChanged || timeChanged) && !forceInspector) {
        // Bounded like every other schedule read: a block is at most 14 days long (time-blocks API), so older ones can't
        // overlap — without the lower bound this transaction re-read every block the business ever made.
        const blocksSnapshot = await transaction.get(
          businessRef
            .collection("timeBlocks")
            .where("startTime", ">=", desiredStart - TIME_BLOCK_MAX_MS)
            .where("startTime", "<", desiredEnd)
        );
        const blockHit = blocksSnapshot.docs
          .map((document) => document.data())
          .find(
            (block) =>
              block.crewId === desiredCrewId &&
              typeof block.startTime === "number" &&
              typeof block.endTime === "number" &&
              scheduleRangesOverlap(desiredStart, desiredEnd, block.startTime, block.endTime)
          );
        const otherBooking = appointmentsSnapshot.docs.some((document) => {
          if (document.id === appointmentId) return false;
          const candidate = document.data();
          return (
            candidate.assignedCrewId === desiredCrewId &&
            candidate.status !== "cancelled" &&
            typeof candidate.startTime === "number" &&
            typeof candidate.endTime === "number" &&
            scheduleRangesOverlap(desiredStart, desiredEnd, candidate.startTime, candidate.endTime)
          );
        });
        if (blockHit || otherBooking) {
          const label =
            blockHit && typeof blockHit.label === "string" && blockHit.label
              ? blockHit.label
              : "another inspection";
          const crewName =
            typeof targetCrew?.name === "string" && targetCrew.name ? targetCrew.name : "That inspector";
          throw new InspectorBusyError(`${crewName} is busy then (${label}).`);
        }
      }

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
      // forceInspector ("assign anyway?") overrides the inspector's own block, booking and booking lock — the office chose
      // to double-book them — but a job on that resource still refuses.
      if (((lockConflict || appointmentConflict) && !forceInspector) || jobConflict) {
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
        scheduleCapacityUnit: desiredCrewId ? null : previousCapacityUnit,
        startTime: desiredStart,
        endTime: desiredEnd,
        updatedAt: now,
      };
      // The office (not the AI) put this row on a crew.
      if (crewChanged && desiredCrewId) update.assignedBy = "office";
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
        previousCrewId,
        previousStart,
      };
    });
  } catch (error) {
    if (error instanceof InspectorBusyError) {
      return NextResponse.json(
        { error: error.message, code: "inspector_busy", message: error.message },
        { status: 409 }
      );
    }
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

  // Phase 31 (T-152): tell the inspector row about the change — "assigned" for the new row, "reassigned_away" for the
  // old one, "moved" when only the time changed. (Declines are handled in the decline branch above.)
  let staffNotified = 0;
  if (committed) {
    const { appointment, previousCrewId, previousStart, startTime } = committed;
    const newCrewId =
      typeof appointment.assignedCrewId === "string" ? appointment.assignedCrewId : null;
    const crewChanged = newCrewId !== previousCrewId;
    const timeChanged = startTime !== previousStart;
    const notifyCrew = async (change: "assigned" | "moved" | "reassigned_away", crewId: string) => {
      const result = await notifyInspector({
        db,
        businessId,
        appointment: { ...appointment, appointmentId },
        change,
        crewId,
      });
      staffNotified += result.emailed + result.texted;
    };
    if (crewChanged && previousCrewId) await notifyCrew("reassigned_away", previousCrewId);
    if (crewChanged && newCrewId) await notifyCrew("assigned", newCrewId);
    else if (!crewChanged && timeChanged && newCrewId) await notifyCrew("moved", newCrewId);
  }

  let notificationStatus: NotificationDeliveryState = "unconfigured";
  const notifiedChannels: ConfirmChannel[] = [];
  if (notifyCustomer && committed) {
    const { appointment, business, startTime } = committed;
    // The number the caller said on the call wins over caller ID.
    const callerPhone = contactPhone(appointment) ?? null;
    const callerEmail =
      typeof appointment.callerEmail === "string" ? appointment.callerEmail : null;
    const timeZone =
      typeof business.timezone === "string" ? business.timezone : "America/New_York";
    const when = new Date(startTime).toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
    // Owner, 2026-09-28: confirm by what the caller gave on the call — email if they gave one, text if they said OK to
    // text, BOTH when both (confirmChannels). No AI phone call. An explicit sms/email/none (older screens) forces one.
    const channels: ConfirmChannel[] =
      notifyChannel === "sms" || notifyChannel === "email"
        ? [notifyChannel]
        : notifyChannel === "none"
          ? []
          : confirmChannels({ smsEnabled: isSmsEnabled(business), phone: callerPhone, textOk: appointment.textOk as boolean | undefined, email: callerEmail });
    const statuses: NotificationDeliveryState[] = [];

    if (channels.includes("sms") && callerPhone && isSmsEnabled(business)) {
      try {
        notificationStatus = await sendSms({
          businessId,
          to: callerPhone,
          body: bookingConfirmed({
            service:
              typeof appointment.serviceType === "string" && appointment.serviceType
                ? appointment.serviceType
                : "Appointment",
            when,
            street:
              typeof appointment.address === "string" && appointment.address
                ? appointment.address
                : "your address",
            businessName:
              typeof business.businessName === "string" ? business.businessName : "Your Company",
            businessPhone:
              typeof business.contactPhone === "string" && business.contactPhone
                ? business.contactPhone
                : "the office",
          }),
          messageType: "customer-confirmation",
          entityId: `${appointmentId}:${startTime}`,
          purpose: "appointment_confirmed",
          // T-169: from the line this caller dialed (or the business's default line when the office booked it).
          calledNumber: typeof appointment.calledNumber === "string" ? appointment.calledNumber : null,
        });
        statuses.push(notificationStatus);
        if (notificationStatus === "delivered") notifiedChannels.push("sms");
      } catch (error) {
        console.error("Customer SMS failed after appointment persisted:", error);
        statuses.push("failed");
      }
    }
    if (channels.includes("email") && callerEmail) {
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
        statuses.push(notificationStatus);
        if (notificationStatus === "delivered") notifiedChannels.push("email");
      } catch (error) {
        console.error(
          "Customer notification ledger failed after appointment persisted:",
          error
        );
        statuses.push("failed");
      }
    }
    // Delivered if ANY channel got through; otherwise the most telling failure.
    notificationStatus = statuses.includes("delivered")
      ? "delivered"
      : statuses.find((status) => status !== "unconfigured") ?? "unconfigured";
  }

  return NextResponse.json({
    ok: true,
    notificationStatus,
    notifiedCustomer: notificationStatus === "delivered",
    /** Every channel that reached the customer ("email", "sms"). */
    notifiedChannels,
    /** Older screens read one channel; kept for them. */
    notifiedVia: notifiedChannels.includes("sms") ? "sms" : notifiedChannels[0] ?? null,
    staffNotified,
  });
}

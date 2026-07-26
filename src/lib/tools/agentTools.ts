import type { Appointment, Lead, AgentAction } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";
import {
  claimOperation,
  completeOperationAttempt,
  createEmailOperationId,
  getOperation,
  startOperationAttempt,
} from "@/lib/ops/ledger";
import type { Firestore } from "firebase-admin/firestore";
import { isCommsConfigured, sendEmail, sendWithLedger } from "@/lib/comms/send";

export interface CheckAvailabilityInput {
  businessId: string;
  preferredDate?: string;
  serviceType?: string;
  durationMinutes?: number;
}

export interface CheckAvailabilityOutput {
  available: boolean;
  suggestedSlots: Array<{ startTime: string; endTime: string }>;
}

const DEFAULT_TZ = "America/New_York";
export const SCHEDULE_BUCKET_MS = 15 * 60 * 1000;
export const DEFAULT_SCHEDULE_DURATION_MS = 60 * 60 * 1000;
const AVAILABILITY_STEP_MINUTES = 30;
const AVAILABILITY_SCAN_DAYS = 14;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

interface ExistingSchedule {
  startTime: number;
  endTime: number;
  status?: string;
  assignedCrewId?: string | null;
}

export type NotificationDeliveryState =
  | "delivered"
  | "failed"
  | "pending"
  | "unconfigured";

export class SchedulingConflictError extends Error {
  readonly code:
    | "invalid_schedule"
    | "outside_business_hours"
    | "slot_conflict";

  constructor(
    code: SchedulingConflictError["code"],
    message: string
  ) {
    super(message);
    this.name = "SchedulingConflictError";
    this.code = code;
  }
}

function zonedParts(timestamp: number, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "long",
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second")),
    weekday: value("weekday") ?? "",
  };
}

/** Convert a wall-clock time in an IANA timezone to its UTC epoch, including DST. */
export function zonedDateTimeToUtc(
  input: Omit<ZonedParts, "second" | "weekday"> & { second?: number },
  timeZone: string
): number | null {
  const targetAsUtc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    input.second ?? 0
  );
  let guess = targetAsUtc;
  try {
    for (let iteration = 0; iteration < 4; iteration++) {
      const actual = zonedParts(guess, timeZone);
      const actualAsUtc = Date.UTC(
        actual.year,
        actual.month - 1,
        actual.day,
        actual.hour,
        actual.minute,
        actual.second
      );
      const adjustment = targetAsUtc - actualAsUtc;
      guess += adjustment;
      if (adjustment === 0) break;
    }
    const roundTrip = zonedParts(guess, timeZone);
    if (
      roundTrip.year !== input.year ||
      roundTrip.month !== input.month ||
      roundTrip.day !== input.day ||
      roundTrip.hour !== input.hour ||
      roundTrip.minute !== input.minute
    ) {
      return null;
    }
    return guess;
  } catch {
    return null;
  }
}

function parseBusinessHours(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, string>;
}

function parseDayHours(value: string | undefined): { open: number; close: number } | null {
  if (!value || value.trim().toLowerCase() === "closed") return null;
  const match = value.match(/^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const open = Number(match[1]) * 60 + Number(match[2]);
  const close = Number(match[3]) * 60 + Number(match[4]);
  if (open < 0 || close > 24 * 60 || close <= open) return null;
  return { open, close };
}

export function scheduleRangesOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number
): boolean {
  return leftStart < rightEnd && leftEnd > rightStart;
}

export function scheduleResourceKey(resourceId?: string | null): string {
  return resourceId ? `crew:${resourceId}` : "unassigned";
}

export function scheduleBucketStarts(startTime: number, endTime: number): number[] {
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    throw new SchedulingConflictError(
      "invalid_schedule",
      "A valid start and end time are required."
    );
  }
  const first = Math.floor(startTime / SCHEDULE_BUCKET_MS) * SCHEDULE_BUCKET_MS;
  const buckets: number[] = [];
  for (let bucket = first; bucket < endTime; bucket += SCHEDULE_BUCKET_MS) {
    buckets.push(bucket);
  }
  return buckets;
}

export function scheduleLockId(resourceKey: string, bucketStart: number): string {
  return `${encodeURIComponent(resourceKey)}:${bucketStart}`;
}

export function isScheduleWithinBusinessHours(
  startTime: number,
  endTime: number,
  businessHours: unknown,
  timeZone: string
): boolean {
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return false;
  }
  const hours = parseBusinessHours(businessHours);
  if (!hours) return false;
  try {
    const start = zonedParts(startTime, timeZone);
    const end = zonedParts(endTime, timeZone);
    if (start.year !== end.year || start.month !== end.month || start.day !== end.day) {
      return false;
    }
    const dayHours = parseDayHours(hours[start.weekday]);
    if (!dayHours) return false;
    const startMinutes = start.hour * 60 + start.minute;
    const endMinutes = end.hour * 60 + end.minute;
    return startMinutes >= dayHours.open && endMinutes <= dayHours.close;
  } catch {
    return false;
  }
}

function addLocalDays(
  date: Pick<ZonedParts, "year" | "month" | "day">,
  days: number
): Pick<ZonedParts, "year" | "month" | "day"> {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function preferredLocalDate(
  preferredDate: string | undefined,
  now: Date,
  timeZone: string
): Pick<ZonedParts, "year" | "month" | "day"> {
  const dateOnly = preferredDate?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return { year: Number(dateOnly[1]), month: Number(dateOnly[2]), day: Number(dateOnly[3]) };
  }
  if (preferredDate) {
    const parsed = new Date(preferredDate);
    if (!Number.isNaN(parsed.getTime())) {
      const local = zonedParts(parsed.getTime(), timeZone);
      return { year: local.year, month: local.month, day: local.day };
    }
  }
  const localNow = zonedParts(now.getTime(), timeZone);
  return addLocalDays(localNow, 1);
}

export function buildAvailableSlots(options: {
  businessHours: unknown;
  timeZone: string;
  existing: ExistingSchedule[];
  preferredDate?: string;
  durationMinutes?: number;
  now?: Date;
  maxSlots?: number;
}): Array<{ startTime: string; endTime: string }> {
  const hours = parseBusinessHours(options.businessHours);
  if (!hours) return [];
  const durationMinutes = options.durationMinutes ?? 60;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 24 * 60) {
    return [];
  }
  const now = options.now ?? new Date();
  const firstDate = preferredLocalDate(options.preferredDate, now, options.timeZone);
  const maxSlots = options.maxSlots ?? 3;
  const slots: Array<{ startTime: string; endTime: string }> = [];

  for (let offset = 0; offset < AVAILABILITY_SCAN_DAYS && slots.length < maxSlots; offset++) {
    const date = addLocalDays(firstDate, offset);
    const noon = zonedDateTimeToUtc({ ...date, hour: 12, minute: 0 }, options.timeZone);
    if (noon === null) continue;
    const weekday = zonedParts(noon, options.timeZone).weekday;
    const dayHours = parseDayHours(hours[weekday]);
    if (!dayHours) continue;

    for (
      let minute = dayHours.open;
      minute + durationMinutes <= dayHours.close && slots.length < maxSlots;
      minute += AVAILABILITY_STEP_MINUTES
    ) {
      const startTime = zonedDateTimeToUtc(
        { ...date, hour: Math.floor(minute / 60), minute: minute % 60 },
        options.timeZone
      );
      if (startTime === null || startTime <= now.getTime()) continue;
      const endTime = startTime + durationMinutes * 60 * 1000;
      const occupied = options.existing.some(
        (entry) =>
          entry.status !== "cancelled" &&
          scheduleRangesOverlap(startTime, endTime, entry.startTime, entry.endTime)
      );
      if (!occupied) {
        slots.push({
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
        });
      }
    }
  }
  return slots;
}

export async function runLedgeredEmail(options: {
  firestore: Firestore;
  businessId: string;
  messageType: string;
  entityId: string;
  entityRef: { collection: string; id: string };
  to: string;
  subject: string;
  html: string;
}): Promise<NotificationDeliveryState> {
  return sendWithLedger({
    firestore: options.firestore,
    businessId: options.businessId,
    to: options.to,
    subject: options.subject,
    html: options.html,
    messageType: options.messageType,
    entityId: options.entityId,
    entityRef: options.entityRef,
  });
}

// Reads timezone from business Firestore doc. Falls back to Eastern.
export async function getBusinessTimezone(businessId: string): Promise<string> {
  const db = getAdminFirestore();
  if (!db) return DEFAULT_TZ;
  try {
    const snap = await db.collection("businesses").doc(businessId).get();
    const tz = snap.data()?.timezone;
    return typeof tz === "string" && tz.length > 0 ? tz : DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

export async function checkAvailability(
  input: CheckAvailabilityInput
): Promise<CheckAvailabilityOutput> {
  const db = getAdminFirestore();
  if (!db) return { available: false, suggestedSlots: [] };

  try {
    const businessDoc = await db.collection("businesses").doc(input.businessId).get();
    if (!businessDoc.exists) return { available: false, suggestedSlots: [] };
    const businessData = businessDoc.data() ?? {};
    const timeZone =
      typeof businessData.timezone === "string" ? businessData.timezone : DEFAULT_TZ;
    const now = new Date();
    const scanEnd = now.getTime() + (AVAILABILITY_SCAN_DAYS + 2) * 24 * 60 * 60 * 1000;
    const [appointmentSnapshot, jobSnapshot] = await Promise.all([
      db
        .collection("businesses")
        .doc(input.businessId)
        .collection("appointments")
        .where("startTime", ">=", now.getTime())
        .where("startTime", "<", scanEnd)
        .get(),
      db
        .collection("businesses")
        .doc(input.businessId)
        .collection("jobs")
        .where("scheduledStart", ">=", now.getTime())
        .where("scheduledStart", "<", scanEnd)
        .get(),
    ]);
    const existingAppointments = appointmentSnapshot.docs.map((document) => {
      const data = document.data();
      return {
        startTime: Number(data.startTime),
        endTime: Number(data.endTime),
        status: typeof data.status === "string" ? data.status : undefined,
        assignedCrewId:
          typeof data.assignedCrewId === "string" ? data.assignedCrewId : undefined,
      };
    });
    const existingJobs = jobSnapshot.docs.flatMap((document) => {
      const data = document.data();
      return typeof data.scheduledStart === "number" &&
        typeof data.scheduledEnd === "number"
        ? [{ startTime: data.scheduledStart, endTime: data.scheduledEnd }]
        : [];
    });
    const slots = buildAvailableSlots({
      businessHours: businessData.businessHours,
      timeZone,
      // Availability remains advisory (D-1), but never suggests a period already
      // represented on either scheduling collection.
      existing: [...existingAppointments, ...existingJobs],
      preferredDate: input.preferredDate,
      durationMinutes: input.durationMinutes,
      now,
    });
    return { available: slots.length > 0, suggestedSlots: slots };
  } catch (error) {
    console.error("checkAvailability error:", error);
    return { available: false, suggestedSlots: [] };
  }
}

export interface BookAppointmentInput {
  businessId: string;
  callerName: string;
  callerPhone: string;
  callerEmail?: string;
  serviceType?: string;
  address?: string;
  notes?: string;
  startTime: number;
  endTime: number;
  sourceCallId?: string;
}

export async function bookAppointment(input: BookAppointmentInput): Promise<Appointment> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore not available");
  const businessRef = db.collection("businesses").doc(input.businessId);
  const appointmentRef = businessRef.collection("appointments").doc();
  const appointmentId = appointmentRef.id;
  const now = Date.now();
  if (!Number.isFinite(input.startTime) || !Number.isFinite(input.endTime) || input.endTime <= input.startTime) {
    throw new SchedulingConflictError(
      "invalid_schedule",
      "The requested appointment needs a valid start and end time."
    );
  }
  if (input.endTime <= now) {
    throw new SchedulingConflictError(
      "invalid_schedule",
      "The requested appointment must be in the future."
    );
  }
  const appointment: Appointment = {
    appointmentId,
    businessId: input.businessId,
    callerName: input.callerName,
    callerPhone: input.callerPhone,
    callerEmail: input.callerEmail,
    serviceType: input.serviceType,
    address: input.address,
    notes: input.notes,
    startTime: input.startTime,
    endTime: input.endTime,
    calendarProvider: "mock",
    status: "requested",
    pendingConfirmation: true,
    sourceCallId: input.sourceCallId,
    createdAt: now,
    updatedAt: now,
  };
  const lockBuckets = scheduleBucketStarts(input.startTime, input.endTime);
  const lockRefs = lockBuckets.map((bucket) =>
    businessRef
      .collection("schedulingLocks")
      .doc(scheduleLockId(scheduleResourceKey(), bucket))
  );
  let businessData: Record<string, unknown> = {};

  await db.runTransaction(async (transaction) => {
    const businessDoc = await transaction.get(businessRef);
    if (!businessDoc.exists) throw new Error(`Business ${input.businessId} not found`);
    businessData = businessDoc.data() ?? {};
    const timeZone =
      typeof businessData.timezone === "string" ? businessData.timezone : DEFAULT_TZ;
    if (
      !isScheduleWithinBusinessHours(
        input.startTime,
        input.endTime,
        businessData.businessHours,
        timeZone
      )
    ) {
      throw new SchedulingConflictError(
        "outside_business_hours",
        "That requested time is outside the business's configured hours."
      );
    }

    const conflictQuery = businessRef
      .collection("appointments")
      .where("startTime", "<", input.endTime);
    const [lockSnapshots, existingSnapshot] = await Promise.all([
      Promise.all(lockRefs.map((lockRef) => transaction.get(lockRef))),
      transaction.get(conflictQuery),
    ]);
    const occupiedByLock = lockSnapshots.some((snapshot) => snapshot.exists);
    const occupiedByLegacyRecord = existingSnapshot.docs.some((document) => {
      const data = document.data();
      return (
        data.status !== "cancelled" &&
        !data.assignedCrewId &&
        scheduleRangesOverlap(
          input.startTime,
          input.endTime,
          Number(data.startTime),
          Number(data.endTime)
        )
      );
    });
    if (occupiedByLock || occupiedByLegacyRecord) {
      throw new SchedulingConflictError(
        "slot_conflict",
        "That requested time was just taken. Please choose another opening."
      );
    }

    for (const [index, lockRef] of lockRefs.entries()) {
      transaction.create(lockRef, {
        resourceKey: scheduleResourceKey(),
        bucketStart: lockBuckets[index],
        entityType: "appointment",
        entityId: appointmentId,
        startTime: input.startTime,
        endTime: input.endTime,
        updatedAt: now,
      });
    }
    transaction.create(appointmentRef, appointment);
  });

  // Persistence is complete before notification. Delivery state lives in T-021,
  // never on the appointment document, and cannot roll back the requested slot.
  if (typeof businessData.notificationEmail === "string") {
    const biz_tz: string =
      typeof businessData.timezone === "string" ? businessData.timezone : DEFAULT_TZ;
    const startDate = new Date(input.startTime).toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: biz_tz,
    });
    const biz: BizBranding = {
      businessName:
        typeof businessData.businessName === "string"
          ? businessData.businessName
          : "Your Company",
      brandColor: typeof businessData.brandColor === "string" ? businessData.brandColor : null,
      logoUrl: typeof businessData.logoUrl === "string" ? businessData.logoUrl : null,
      contactPhone:
        typeof businessData.contactPhone === "string" ? businessData.contactPhone : null,
      contactEmail:
        typeof businessData.contactEmail === "string" ? businessData.contactEmail : null,
      websiteUrl: typeof businessData.websiteUrl === "string" ? businessData.websiteUrl : null,
    };
    const subject = `New Appointment Request \u2014 ${input.callerName}`;
    const html = bookingEmailHtml({
      callerName: input.callerName,
      callerPhone: input.callerPhone,
      serviceType: input.serviceType ?? "Not specified",
      startDate,
      address: input.address ?? "Not provided",
      callId: input.sourceCallId ?? "N/A",
    }, biz);
    await runLedgeredEmail({
      firestore: db,
      businessId: input.businessId,
      messageType: "owner-booking-request",
      entityId: appointmentId,
      entityRef: { collection: "appointments", id: appointmentId },
      to: businessData.notificationEmail as string,
      subject,
      html,
    });
  }

  return appointment;
}

export interface CreateLeadInput {
  businessId: string;
  callerName?: string;
  callerPhone?: string;
  callerEmail?: string;
  serviceRequested?: string;
  address?: string;
  urgency: "low" | "normal" | "urgent" | "unknown";
  notes?: string;
  sourceCallId?: string;
  callbackConsent?: boolean;
}

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore not available");

  const businessRef = db.collection("businesses").doc(input.businessId);
  const businessDoc = await businessRef.get();
  if (!businessDoc.exists) throw new Error(`Business ${input.businessId} not found`);

  const now = Date.now();
  const bizData = businessDoc.data();
  const delayMinutes = bizData?.callbackDelayMinutes;
  const hasCallbackDelay =
    typeof delayMinutes === "number" &&
    Number.isFinite(delayMinutes) &&
    delayMinutes >= 0;
  const hasCallablePhone =
    typeof input.callerPhone === "string" &&
    (input.callerPhone.match(/\d/g) ?? []).length >= 7;
  const callbackState: "pending" | "none" =
    hasCallbackDelay && hasCallablePhone ? "pending" : "none";
  const callbackDueAt =
    callbackState === "pending" ? now + delayMinutes * 60 * 1000 : null;

  const leadId = `lead_${now}`;
  const lead: Lead & {
    callbackState: "pending" | "none";
    callbackDueAt: number | null;
    callbackConsent: boolean;
  } = {
    leadId,
    businessId: input.businessId,
    callerName: input.callerName,
    callerPhone: input.callerPhone,
    callerEmail: input.callerEmail,
    serviceRequested: input.serviceRequested,
    address: input.address,
    urgency: input.urgency,
    notes: input.notes,
    sourceCallId: input.sourceCallId,
    status: "new",
    callbackState,
    callbackDueAt,
    callbackConsent: input.callbackConsent === true,
    createdAt: now,
    updatedAt: now,
  };

  await businessRef.collection("leads").doc(leadId).set(lead);

  return lead;
}

export interface EscalateCallInput {
  businessId: string;
  callId: string;
  reason: string;
  callerPhone?: string;
  summary?: string;
}

export type EscalationStatus =
  | "accepted"
  | "delivered"
  | "failed"
  | "unconfigured";

export interface EscalateCallOutput {
  status: EscalationStatus;
  escalated: boolean;
  escalationTarget: string;
  operationId: string;
  callId: string;
}

export async function escalateCall(
  input: EscalateCallInput
): Promise<EscalateCallOutput> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore not available");

  const businessDoc = await db.collection("businesses").doc(input.businessId).get();
  if (!businessDoc.exists) throw new Error(`Business ${input.businessId} not found`);

  const businessData = businessDoc.data() ?? {};
  const escalationPhone =
    typeof businessData.escalationPhone === "string" &&
    businessData.escalationPhone.trim()
      ? businessData.escalationPhone.trim()
      : null;
  const notificationEmail =
    typeof businessData.notificationEmail === "string" &&
    businessData.notificationEmail.trim()
      ? businessData.notificationEmail.trim()
      : null;
  const operationId = createEmailOperationId("urgent-escalation", input.callId);
  const baseOutput = {
    escalationTarget: escalationPhone ?? "unconfigured",
    operationId,
    callId: input.callId,
  };

  // No caller details are written to the ledger. The call record remains the
  // source for PII; the stable call ID is enough to correlate this operation.
  const claim = await claimOperation(
    {
      businessId: input.businessId,
      opId: operationId,
      kind: "email",
      entityRef: { collection: "calls", id: input.callId },
    },
    { firestore: db }
  );
  if (!claim.claimed && claim.operation.state === "succeeded") {
    return { ...baseOutput, status: "delivered", escalated: true };
  }
  if (!claim.claimed && claim.operation.state === "pending") {
    return { ...baseOutput, status: "accepted", escalated: false };
  }
  if (
    !claim.claimed &&
    claim.operation.lastFailure?.classification !== "retryable"
  ) {
    return { ...baseOutput, status: "failed", escalated: false };
  }

  let attempt;
  try {
    attempt = await startOperationAttempt(
      { businessId: input.businessId, opId: operationId },
      { firestore: db }
    );
  } catch (error) {
    // A simultaneous retry may have started or completed after our claim read.
    // Re-read the ledger instead of executing a second provider call.
    const latest = await getOperation(
      { businessId: input.businessId, opId: operationId },
      { firestore: db }
    );
    if (latest?.state === "succeeded") {
      return { ...baseOutput, status: "delivered", escalated: true };
    }
    if (latest?.state === "pending") {
      return { ...baseOutput, status: "accepted", escalated: false };
    }
    if (latest?.state === "failed") {
      return {
        ...baseOutput,
        status:
          latest.lastFailure?.code === "configuration_missing"
            ? "unconfigured"
            : "failed",
        escalated: false,
      };
    }
    throw error;
  }

  if (!isCommsConfigured() || !notificationEmail || !escalationPhone) {
    await completeOperationAttempt(
      {
        businessId: input.businessId,
        opId: operationId,
        attemptId: attempt.attemptId,
        state: "failed",
        failure: { classification: "retryable", code: "configuration_missing" },
      },
      { firestore: db }
    );
    return { ...baseOutput, status: "unconfigured", escalated: false };
  }

  const escalationTime = new Date().toLocaleString("en-US", {
    timeZone:
      typeof businessData.timezone === "string"
        ? businessData.timezone
        : DEFAULT_TZ,
  });
  const biz: BizBranding = {
    businessName:
      typeof businessData.businessName === "string"
        ? businessData.businessName
        : "Your Company",
    brandColor:
      typeof businessData.brandColor === "string"
        ? businessData.brandColor
        : "#7f1d1d",
    logoUrl: typeof businessData.logoUrl === "string" ? businessData.logoUrl : null,
    contactPhone:
      typeof businessData.contactPhone === "string"
        ? businessData.contactPhone
        : null,
    contactEmail:
      typeof businessData.contactEmail === "string"
        ? businessData.contactEmail
        : null,
  };

  const subject = `URGENT: Call Escalation \u2014 ${biz.businessName}`;
  const html = escalationEmailHtml(
    {
      callerPhone: input.callerPhone ?? "Unknown",
      reason: input.reason,
      summary: input.summary ?? "No summary",
      callId: input.callId,
      escalationTime,
    },
    biz
  );

  const sendResult = await sendEmail({
    to: notificationEmail,
    subject,
    html,
  });

  if (sendResult.status !== "delivered") {
    await completeOperationAttempt(
      {
        businessId: input.businessId,
        opId: operationId,
        attemptId: attempt.attemptId,
        state: "failed",
        failure: {
          classification: sendResult.failureClassification ?? "retryable",
          code: sendResult.failureCode ?? "provider_rejected",
        },
      },
      { firestore: db },
    );
    return {
      ...baseOutput,
      status: sendResult.status === "unconfigured" ? "unconfigured" : "failed",
      escalated: false,
    };
  }

  // If this ledger completion fails after Resend accepted the send,
  // leave the attempt pending for reconciliation; never guess it into "failed".
  await completeOperationAttempt(
    {
      businessId: input.businessId,
      opId: operationId,
      attemptId: attempt.attemptId,
      state: "succeeded",
      providerId: sendResult.providerId,
    },
    { firestore: db },
  );
  return { ...baseOutput, status: "delivered", escalated: true };
}

const BASE_URL = "https://ai-roof.vercel.app";

interface BizBranding {
  businessName: string;
  brandColor?: string | null;
  logoUrl?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  websiteUrl?: string | null;
}

function brandHeader(biz: BizBranding): string {
  const bg = biz.brandColor ?? "#0f172a";
  const logo = biz.logoUrl
    ? `<img src="${biz.logoUrl}" alt="${biz.businessName}" height="44" style="display:block;margin:0 auto 12px;max-width:180px;">`
    : `<p style="margin:0 0 10px;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${biz.businessName}</p>`;
  const contact = [biz.contactPhone, biz.contactEmail]
    .filter(Boolean).join(" &nbsp;·&nbsp; ");
  return `<td style="background:${bg};padding:28px 32px;text-align:center;">
    ${logo}
    ${contact ? `<p style="margin:0;font-size:12px;color:rgba(255,255,255,0.7);">${contact}</p>` : ""}
  </td>`;
}

function emailShell(biz: BizBranding, badgeLabel: string, badgeColor: string, title: string, subtitle: string, cardRows: string, callId: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr>${brandHeader(biz)}</tr>
  <tr><td style="padding:20px 32px 8px;">
    <span style="display:inline-block;background:${badgeColor};color:#fff;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 10px;border-radius:20px;">${badgeLabel}</span>
  </td></tr>
  <tr><td style="padding:12px 32px 16px;">
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#0f172a;">${title}</h1>
    <p style="margin:0;font-size:14px;color:#64748b;line-height:1.5;">${subtitle}</p>
  </td></tr>
  <tr><td style="padding:0 32px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
    <tr><td style="padding:20px 24px;">${cardRows}</td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:12px 32px;">
    <p style="margin:0;font-size:10px;color:#cbd5e1;">
      Call ID: ${callId} &nbsp;·&nbsp;
      <a href="${BASE_URL}/company/dashboard" style="color:#94a3b8;text-decoration:none;">View dashboard</a> &nbsp;·&nbsp;
      <span style="color:#e2e8f0;">Powered by Luxor AI</span>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function dataRow(label: string, value: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
<tr>
  <td style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;vertical-align:top;width:110px;padding-top:2px;">${label}</td>
  <td style="font-size:14px;color:#1e293b;font-weight:500;">${value}</td>
</tr></table>`;
}

function bookingEmailHtml(
  p: { callerName: string; callerPhone: string; serviceType: string; startDate: string; address: string; callId: string },
  biz: BizBranding
): string {
  const rows = [
    dataRow("Name", p.callerName),
    dataRow("Phone", p.callerPhone),
    dataRow("Service", p.serviceType),
    dataRow("Requested time", p.startDate),
    dataRow("Address", p.address),
  ].join("");
  return emailShell(
    biz, "New Request", "#22c55e",
    "New Appointment Request",
    `Your AI receptionist captured this requested time. Review and confirm it with the customer.`,
    rows, p.callId
  );
}

function escalationEmailHtml(
  p: { callerPhone: string; reason: string; summary: string; callId: string; escalationTime: string },
  biz: BizBranding
): string {
  const rows = [
    dataRow("Caller", p.callerPhone),
    dataRow("Reason", p.reason),
    dataRow("Summary", p.summary),
    dataRow("Time", p.escalationTime),
  ].join("");
  return emailShell(
    biz, "Urgent Escalation", "#dc2626",
    "Urgent: Call Escalation",
    `Your AI receptionist flagged this call as urgent. Respond immediately.`,
    rows, p.callId
  );
}

export interface LookupAppointmentInput {
  businessId: string;
  callId: string;
  verifiedCallerPhone?: string;
  /** Legacy model-supplied fields retained for tool-schema compatibility only. */
  callerPhone?: string;
  callerName?: string;
  address?: string;
}

export async function lookupAppointment(input: LookupAppointmentInput): Promise<string> {
  const verifiedPhone = normalizeAppointmentPhone(input.verifiedCallerPhone);
  if (!verifiedPhone || input.callId.trim().length === 0) {
    return "I can't verify you from caller ID — the office will call back.";
  }

  const db = getAdminFirestore();
  if (!db) return "Unable to look up appointments right now.";

  try {
    const businessRef = db.collection("businesses").doc(input.businessId);
    const [snap, timezone] = await Promise.all([
      businessRef.collection("appointments").get(),
      getBusinessTimezone(input.businessId),
    ]);

    if (snap.empty) return "No active appointment was found for the verified caller number.";

    const matches = snap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          appointmentId: doc.id,
          callerPhone: normalizeAppointmentPhone(data.callerPhone),
          serviceType:
            typeof data.serviceType === "string" && data.serviceType.trim()
              ? data.serviceType.trim()
              : "service",
          startTime: appointmentTimeMillis(data.startTime),
          status: typeof data.status === "string" ? data.status : "unknown",
        };
      })
      .filter(
        (appointment) =>
          appointment.callerPhone === verifiedPhone &&
          (appointment.status === "requested" || appointment.status === "confirmed")
      )
      .sort((a, b) => a.startTime - b.startTime)
      .slice(0, 3);

    if (matches.length === 0) {
      return "No active appointment was found for the verified caller number.";
    }

    const now = Date.now();
    await businessRef
      .collection("vapiAppointmentConfirmations")
      .doc(encodeURIComponent(input.callId))
      .set({
        businessId: input.businessId,
        callId: input.callId,
        callerPhoneNormalized: verifiedPhone,
        status: "pending",
        candidates: matches.map((appointment) => ({
          appointmentId: appointment.appointmentId,
          callerPhoneNormalized: appointment.callerPhone,
          serviceType: appointment.serviceType,
          startTime: appointment.startTime,
        })),
        createdAt: new Date(now),
        expiresAt: new Date(now + APPOINTMENT_CONFIRMATION_WINDOW_MS),
      });

    const summaries = matches.map((appointment, index) => {
      const appointmentTime = new Date(appointment.startTime).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZone: timezone,
      });
      return `Appointment ${index + 1}: ${appointment.serviceType} on ${appointmentTime}`;
    });

    const confirmationInstruction = matches.length === 1
      ? "Ask the caller to confirm cancellation, then call cancelAppointment with confirmCancellation=true."
      : "Ask which appointment number they mean and confirm cancellation, then call cancelAppointment with that appointmentNumber and confirmCancellation=true.";

    return `${summaries.join("; ")}. ${confirmationInstruction}`;
  } catch (err) {
    console.error("lookupAppointment error:", err);
    return "Error looking up appointment.";
  }
}

export interface CancelAppointmentInput {
  businessId: string;
  callId: string;
  verifiedCallerPhone?: string;
  confirmCancellation?: boolean;
  appointmentNumber?: number;
  /** Legacy parameter: never authoritative without a matching server-side lookup. */
  appointmentId?: string;
}

export interface CancelAppointmentOutput {
  cancelled: boolean;
  serviceType: string;
  startTime: number;
}

export async function cancelAppointment(input: CancelAppointmentInput): Promise<CancelAppointmentOutput> {
  const verifiedPhone = normalizeAppointmentPhone(input.verifiedCallerPhone);
  if (!verifiedPhone || input.callId.trim().length === 0) {
    throw new Error("I can't verify you from caller ID — the office will call back.");
  }
  if (input.confirmCancellation !== true) {
    throw new Error("Ask the caller to confirm the cancellation before continuing.");
  }

  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore not available");

  const now = Date.now();
  const businessRef = db.collection("businesses").doc(input.businessId);
  const confirmationRef = businessRef
    .collection("vapiAppointmentConfirmations")
    .doc(encodeURIComponent(input.callId));

  return db.runTransaction(async (transaction) => {
    const confirmationSnap = await transaction.get(confirmationRef);
    const confirmation = confirmationSnap.data();
    const expiresAt = appointmentTimeMillis(confirmation?.expiresAt);
    if (
      !confirmationSnap.exists ||
      confirmation?.status !== "pending" ||
      confirmation?.businessId !== input.businessId ||
      confirmation?.callId !== input.callId ||
      confirmation?.callerPhoneNormalized !== verifiedPhone ||
      expiresAt <= now
    ) {
      throw new Error("No recent verified appointment lookup is available for this call.");
    }

    const candidates = Array.isArray(confirmation.candidates)
      ? confirmation.candidates.filter(isCancellationCandidate)
      : [];
    let candidate: AppointmentCancellationCandidate | undefined;
    if (
      Number.isInteger(input.appointmentNumber) &&
      (input.appointmentNumber ?? 0) >= 1
    ) {
      candidate = candidates[(input.appointmentNumber as number) - 1];
    } else if (input.appointmentId) {
      candidate = candidates.find(
        (item) => item.appointmentId === input.appointmentId
      );
    } else if (candidates.length === 1) {
      candidate = candidates[0];
    }

    if (!candidate) {
      throw new Error("Specify the verified appointment number before cancelling.");
    }
    if (candidate.callerPhoneNormalized !== verifiedPhone) {
      throw new Error("The verified appointment is no longer available to cancel.");
    }

    const appointmentRef = businessRef
      .collection("appointments")
      .doc(candidate.appointmentId);
    const appointmentSnap = await transaction.get(appointmentRef);
    const appointment = appointmentSnap.data();
    if (
      !appointmentSnap.exists ||
      normalizeAppointmentPhone(appointment?.callerPhone) !== verifiedPhone ||
      (appointment?.status !== "requested" && appointment?.status !== "confirmed")
    ) {
      throw new Error("The verified appointment is no longer available to cancel.");
    }

    transaction.update(appointmentRef, {
      status: "cancelled",
      updatedAt: now,
    });
    transaction.update(confirmationRef, {
      status: "consumed",
      consumedAt: new Date(now),
      expiresAt: new Date(now + APPOINTMENT_CONFIRMATION_WINDOW_MS),
    });

    return {
      cancelled: true,
      serviceType: candidate.serviceType,
      startTime: candidate.startTime,
    };
  });
}

const APPOINTMENT_CONFIRMATION_WINDOW_MS = 10 * 60 * 1000;

interface AppointmentCancellationCandidate {
  appointmentId: string;
  callerPhoneNormalized: string;
  serviceType: string;
  startTime: number;
}

function isCancellationCandidate(value: unknown): value is AppointmentCancellationCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.appointmentId === "string" &&
    typeof candidate.callerPhoneNormalized === "string" &&
    typeof candidate.serviceType === "string" &&
    typeof candidate.startTime === "number"
  );
}

function normalizeAppointmentPhone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? digits : undefined;
}

function appointmentTimeMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (
    value !== null &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export interface GetCurrentDateInput {
  businessId: string;
}

export async function getCurrentDate(input: GetCurrentDateInput): Promise<{ today: string; isoDate: string; dayOfWeek: string }> {
  const tz = await getBusinessTimezone(input.businessId);
  const now = new Date();
  const today = now.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz,
  });
  const isoDate = now.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long", timeZone: tz });
  return { today, isoDate, dayOfWeek };
}

export async function logAgentAction(action: AgentAction): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;

  try {
    await db
      .collection("businesses")
      .doc(action.businessId)
      .collection("agentActions")
      .doc(action.actionId)
      .set(action);
  } catch (error) {
    console.error("logAgentAction error:", error);
  }
}

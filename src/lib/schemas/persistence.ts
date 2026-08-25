import { z } from "zod";

import type { Appointment, Lead } from "@/types";
import type { FieldUpdate } from "@/types/jobs";
import { parsedUpdateSchema } from "@/lib/schemas/ai";
import {
  boundedText,
  finiteInteger,
  finiteNumber,
  identifier,
  modelText,
  parseSchema,
  type SchemaParseResult,
} from "@/lib/schemas/common";

const optionalModelText = (maxLength: number) => modelText(maxLength).optional();
const optionalEmail = z.string().trim().email().max(254).optional();
const nonNegativeNumber = finiteNumber.pipe(z.number().nonnegative());

const appointmentRecordSchema: z.ZodType<Appointment, z.ZodTypeDef, unknown> = z
  .object({
    appointmentId: identifier,
    businessId: identifier,
    callerName: optionalModelText(200),
    callerPhone: optionalModelText(64),
    callerEmail: optionalEmail,
    serviceType: optionalModelText(200),
    address: optionalModelText(500),
    startTime: nonNegativeNumber,
    endTime: nonNegativeNumber,
    calendarProvider: z.enum(["google", "calendly", "mock"]),
    calendarEventId: boundedText(512).optional(),
    status: z.enum(["requested", "confirmed", "cancelled", "completed"]),
    sourceCallId: boundedText(256).optional(),
    notes: optionalModelText(2_000),
    pendingConfirmation: z.boolean().optional(),
    assignedCrewId: identifier.optional(),
    createdAt: nonNegativeNumber,
    updatedAt: nonNegativeNumber,
  })
  .refine((value) => value.endTime > value.startTime, {
    path: ["endTime"],
    message: "End time must follow start time",
  });

const leadRecordSchema: z.ZodType<Lead, z.ZodTypeDef, unknown> = z.object({
  leadId: identifier,
  businessId: identifier,
  callerName: optionalModelText(200),
  callerPhone: optionalModelText(64),
  callerEmail: optionalEmail,
  serviceRequested: optionalModelText(300),
  address: optionalModelText(500),
  urgency: z.enum(["low", "normal", "urgent", "unknown"]),
  preferredTime: optionalModelText(200),
  notes: optionalModelText(2_000),
  sourceCallId: boundedText(256).optional(),
  status: z.enum(["new", "contacted", "booked", "closed", "lost"]),
  callAttempts: finiteInteger.pipe(z.number().int().nonnegative()).optional(),
  lastCallAttemptAt: nonNegativeNumber.optional(),
  createdAt: nonNegativeNumber,
  updatedAt: nonNegativeNumber,
});

const fieldUpdateRecordSchema: z.ZodType<
  FieldUpdate,
  z.ZodTypeDef,
  unknown
> = z.object({
  updateId: identifier,
  kind: z.enum(["normal", "correction"]).optional(),
  rawText: boundedText(20_000),
  language: boundedText(50).optional(),
  submittedBy: boundedText(256).optional(),
  createdAt: nonNegativeNumber,
  parsed: parsedUpdateSchema.optional(),
  parseError: boundedText(1_000).optional(),
  targetUpdateId: identifier.optional(),
  correctionField: z.enum(["materials", "labor"]).optional(),
  correctionItem: modelText(500).optional(),
  correctionNewValue: nonNegativeNumber.optional(),
});

export const parseAppointmentRecord = (input: unknown): SchemaParseResult<Appointment> =>
  parseSchema(appointmentRecordSchema, input, "persistence.appointment");

export const parseLeadRecord = (input: unknown): SchemaParseResult<Lead> =>
  parseSchema(leadRecordSchema, input, "persistence.lead");

export const parseFieldUpdateRecord = (input: unknown): SchemaParseResult<FieldUpdate> =>
  parseSchema(fieldUpdateRecordSchema, input, "persistence.field-update");

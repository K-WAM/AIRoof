import { z } from "zod";

import type {
  BookAppointmentInput,
  CancelAppointmentInput,
  CheckAvailabilityInput,
  CreateLeadInput,
  EscalateCallInput,
  GetCurrentDateInput,
  LookupAppointmentInput,
} from "@/lib/tools/agentTools";
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
const optionalPhone = modelText(64).optional();
const optionalEmail = z.string().trim().email().max(254).optional();

export const checkAvailabilityInputSchema: z.ZodType<
  CheckAvailabilityInput,
  z.ZodTypeDef,
  unknown
> = z.object({
  businessId: identifier,
  preferredDate: optionalModelText(100),
  serviceType: optionalModelText(200),
  durationMinutes: finiteInteger.pipe(z.number().positive().max(1_440)).optional(),
});

export const bookAppointmentInputSchema: z.ZodType<
  BookAppointmentInput,
  z.ZodTypeDef,
  unknown
> = z
  .object({
    businessId: identifier,
    callerName: modelText(200),
    callerPhone: modelText(64),
    callerEmail: optionalEmail,
    serviceType: optionalModelText(200),
    address: optionalModelText(500),
    notes: optionalModelText(2_000),
    startTime: finiteNumber,
    endTime: finiteNumber,
    sourceCallId: boundedText(256).optional(),
  })
  .refine((value) => value.endTime > value.startTime, {
    path: ["endTime"],
    message: "End time must follow start time",
  });

export const createLeadInputSchema: z.ZodType<
  CreateLeadInput,
  z.ZodTypeDef,
  unknown
> = z.object({
  businessId: identifier,
  callerName: optionalModelText(200),
  callerPhone: optionalPhone,
  callerEmail: optionalEmail,
  serviceRequested: optionalModelText(300),
  address: optionalModelText(500),
  urgency: z.enum(["low", "normal", "urgent", "unknown"]),
  notes: optionalModelText(2_000),
  sourceCallId: boundedText(256).optional(),
});

export const escalateCallInputSchema: z.ZodType<
  EscalateCallInput,
  z.ZodTypeDef,
  unknown
> = z.object({
  businessId: identifier,
  callId: boundedText(256),
  reason: modelText(1_000),
  callerPhone: optionalPhone,
  summary: optionalModelText(2_000),
});

export const lookupAppointmentInputSchema: z.ZodType<
  LookupAppointmentInput,
  z.ZodTypeDef,
  unknown
> = z.object({
  businessId: identifier,
  callId: boundedText(256),
  verifiedCallerPhone: optionalPhone,
  callerPhone: optionalPhone,
  callerName: optionalModelText(200),
  address: optionalModelText(500),
});

export const cancelAppointmentInputSchema: z.ZodType<
  CancelAppointmentInput,
  z.ZodTypeDef,
  unknown
> = z.object({
  businessId: identifier,
  callId: boundedText(256),
  verifiedCallerPhone: optionalPhone,
  confirmCancellation: z.boolean().optional(),
  appointmentNumber: finiteInteger.pipe(z.number().int().positive()).optional(),
  appointmentId: boundedText(256).optional(),
});

export const getCurrentDateInputSchema: z.ZodType<
  GetCurrentDateInput,
  z.ZodTypeDef,
  unknown
> = z.object({ businessId: identifier });

export const vapiToolInputSchemas = {
  checkAvailability: checkAvailabilityInputSchema,
  bookAppointment: bookAppointmentInputSchema,
  createLead: createLeadInputSchema,
  escalateCall: escalateCallInputSchema,
  lookupAppointment: lookupAppointmentInputSchema,
  cancelAppointment: cancelAppointmentInputSchema,
  getCurrentDate: getCurrentDateInputSchema,
} as const;

export type VapiToolName = keyof typeof vapiToolInputSchemas;
export type VapiToolInputByName = {
  [Name in VapiToolName]: z.output<(typeof vapiToolInputSchemas)[Name]>;
};

export function parseVapiToolInput<Name extends VapiToolName>(
  toolName: Name,
  input: unknown
): SchemaParseResult<VapiToolInputByName[Name]> {
  return parseSchema(
    vapiToolInputSchemas[toolName],
    input,
    `vapi.tool.${toolName}`
  ) as SchemaParseResult<VapiToolInputByName[Name]>;
}

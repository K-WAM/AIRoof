import { z } from "zod";

import type { ScopeClassification } from "@/types";
import type { ParsedUpdate } from "@/types/jobs";
import {
  boundedText,
  finiteNumber,
  modelText,
  parseSchema,
  type SchemaParseResult,
} from "@/lib/schemas/common";

// The model answers "" (or null) for an optional field it has nothing to put in — the field-update prompt even ASKS for
// transcriptEn: "" when the note is already English. Blank means absent; it must never fail the whole parse.
const blankToUndefined = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "") ? undefined : value;
const optionalModelText = (maxLength: number) => z.preprocess(blankToUndefined, modelText(maxLength).optional());
const nonNegativeNumber = finiteNumber.pipe(z.number().nonnegative());

const timelineEntrySchema = z.object({
  time: optionalModelText(100),
  description: modelText(2_000),
  dateMs: nonNegativeNumber.optional(),
});

const materialSchema = z.object({
  item: modelText(500),
  quantity: optionalModelText(100),
  unit: optionalModelText(100),
  cost: nonNegativeNumber.optional(),
});

const laborSchema = z.object({
  description: modelText(500),
  hours: nonNegativeNumber.optional(),
  rate: nonNegativeNumber.optional(),
  arrivalTime: optionalModelText(100),
  departureTime: optionalModelText(100),
});

const issueSchema = z.object({
  description: modelText(2_000),
  severity: z.enum(["low", "medium", "high"]),
  resolution: optionalModelText(2_000),
});

const invoiceLineItemSchema = z.object({
  description: modelText(500),
  quantity: nonNegativeNumber,
  unitPrice: nonNegativeNumber,
  total: nonNegativeNumber,
});

const correctionSchema = z.object({
  item: modelText(500),
  newValue: nonNegativeNumber,
  field: z.enum(["materials", "labor"]).optional(),
  targetHint: optionalModelText(500),
});

export const parsedUpdateSchema: z.ZodType<ParsedUpdate, z.ZodTypeDef, unknown> = z
  .object({
    timeline: z.array(timelineEntrySchema).max(500),
    materials: z.array(materialSchema).max(500),
    labor: z.array(laborSchema).max(500),
    issues: z.array(issueSchema).max(500),
    invoiceSuggestions: z.array(invoiceLineItemSchema).max(500),
    correction: z.preprocess(
      (value) => (value === null ? undefined : value),
      correctionSchema.optional()
    ),
    // Spanish (Phase 12, Phase 6) — display-only, never folded across updates. See ParsedUpdate's
    // own doc comment in src/types/jobs.ts for why buildProjection must ignore both.
    transcriptEn: optionalModelText(20_000),
    sourceLanguage: boundedText(50).optional(),
  })
  .transform(({ correction, transcriptEn, sourceLanguage, ...update }) => ({
    ...update,
    ...(correction ? { correction } : {}),
    ...(transcriptEn ? { transcriptEn } : {}),
    ...(sourceLanguage ? { sourceLanguage } : {}),
  }));

export interface SummaryOutput {
  summary: string;
  actionItems: string[];
}

const summaryOutputSchema: z.ZodType<SummaryOutput, z.ZodTypeDef, unknown> = z.object({
  summary: modelText(4_000),
  actionItems: z.array(modelText(1_000)).max(100),
});

export interface CallOutcomeOutput {
  outcome: "scheduled" | "escalated" | "lead_captured" | "no_action";
  reason: string;
  /** Only what the caller actually said — fills the end-of-call safety-net lead (src/lib/calls/callLead.ts). */
  callerName?: string;
  address?: string;
  service?: string;
}

const callOutcomeOutputSchema: z.ZodType<
  CallOutcomeOutput,
  z.ZodTypeDef,
  unknown
> = z.object({
  outcome: z.enum(["scheduled", "escalated", "lead_captured", "no_action"]),
  reason: modelText(1_000),
  callerName: optionalModelText(200),
  address: optionalModelText(500),
  service: optionalModelText(300),
});

const scopeClassificationSchema: z.ZodType<
  ScopeClassification,
  z.ZodTypeDef,
  unknown
> = z.object({
  category: z.enum([
    "scheduling",
    "service_question",
    "pricing_question",
    "emergency",
    "complaint",
    "existing_appointment",
    "off_topic",
    "unknown",
  ]),
  confidence: finiteNumber.pipe(z.number().min(0).max(1)),
  reason: modelText(1_000),
  allowedToAnswer: z.boolean(),
});

interface FaqSuggestion {
  question: string;
  answer: string;
}

export interface FaqSuggestionsOutput {
  suggestions: FaqSuggestion[];
}

const faqSuggestionsOutputSchema: z.ZodType<
  FaqSuggestionsOutput,
  z.ZodTypeDef,
  unknown
> = z.object({
  suggestions: z
    .array(
      z.object({
        question: modelText(1_000),
        answer: modelText(2_000),
      })
    )
    .max(3),
});

export interface TranscriptMessage {
  role: string;
  text: string;
}

const transcriptSchema: z.ZodType<TranscriptMessage[], z.ZodTypeDef, unknown> = z
  .array(
    z.object({
      role: boundedText(50),
      text: boundedText(10_000),
    })
  )
  .min(1)
  .max(2_000);

export const parseFieldUpdateOutput = (input: unknown): SchemaParseResult<ParsedUpdate> =>
  parseSchema(parsedUpdateSchema, input, "ai.field-update");

export const parseSummaryOutput = (input: unknown): SchemaParseResult<SummaryOutput> =>
  parseSchema(summaryOutputSchema, input, "ai.summary");

export const parseCallOutcomeOutput = (
  input: unknown
): SchemaParseResult<CallOutcomeOutput> =>
  parseSchema(callOutcomeOutputSchema, input, "ai.call-outcome");

export const parseScopeClassification = (
  input: unknown
): SchemaParseResult<ScopeClassification> =>
  parseSchema(scopeClassificationSchema, input, "ai.scope-classification");

export const parseFaqSuggestionsOutput = (
  input: unknown
): SchemaParseResult<FaqSuggestionsOutput> =>
  parseSchema(faqSuggestionsOutputSchema, input, "ai.faq-suggestions");

export const parseTranscript = (input: unknown): SchemaParseResult<TranscriptMessage[]> =>
  parseSchema(transcriptSchema, input, "ai.transcript");

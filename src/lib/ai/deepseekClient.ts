import type { ParsedUpdate } from "@/types/jobs";
import {
  selectClient,
  canUseMock,
  mockLabel,
  type ModelOverrides,
} from "@/lib/ai/registry";
import {
  parseFieldUpdateOutput,
  parseSummaryOutput,
  parseCallOutcomeOutput,
  parseFaqSuggestionsOutput,
} from "@/lib/schemas";

const isProduction = (): boolean => process.env.NODE_ENV === "production";

export interface SummarizeTranscriptOptions {
  transcript: Array<{ role: string; text: string }>;
  businessName: string;
}

export interface ClassifyOutcomeOptions {
  transcript: Array<{ role: string; text: string }>;
  businessName: string;
}

export interface ParseFieldUpdateOptions {
  rawText: string;
  businessName: string;
  industry?: string;
  language?: string;
  jobContext?: {
    title?: string;
    address?: string;
    serviceType?: string;
    clientName?: string;
  };
  modelOverrides?: ModelOverrides;
}

class ParseFieldUpdateError extends Error {
  constructor(
    message: string,
    public readonly needsConfirmation: boolean = false,
    public readonly rawText?: string,
  ) {
    super(message);
    this.name = "ParseFieldUpdateError";
  }
}

export { ParseFieldUpdateError };

export async function parseFieldUpdate(
  options: ParseFieldUpdateOptions
): Promise<ParsedUpdate> {
  const empty: ParsedUpdate = {
    timeline: [],
    materials: [],
    labor: [],
    issues: [],
    invoiceSuggestions: [],
  };

  const { client, selection } = selectClient("parse-field-update", options.modelOverrides);

  if (!client) {
    if (isProduction()) {
      throw new ParseFieldUpdateError("parseFieldUpdate: no AI provider configured");
    }
    if (canUseMock()) {
      return {
        ...empty,
        issues: [{ description: `${mockLabel("parse-field-update")}AI extraction unavailable — provider not configured.`, severity: "low" }],
      };
    }
    throw new ParseFieldUpdateError("parseFieldUpdate: no AI provider configured");
  }

  const { jobContext } = options;
  const contextBlock = jobContext
    ? [
        jobContext.title ? `Job: ${jobContext.title}` : null,
        jobContext.address ? `Address: ${jobContext.address}` : null,
        jobContext.serviceType ? `Service type: ${jobContext.serviceType}` : null,
        jobContext.clientName ? `Client: ${jobContext.clientName}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : null;

  let res;
  try {
    res = await client.chat.completions.create({
      model: selection.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a field intelligence analyst for a ${options.industry ?? "field-service"} company. A foreman or crew member submitted a voice or text update from a job site. Extract structured data from natural language — even if casual, abbreviated, accented, multilingual, or quickly spoken.

LABOR RULES (most important for invoicing):
- Every crew member mentioned = a separate labor entry with their first name as "description".
- "Kevin and John were here" → two entries: {description:"Kevin"}, {description:"John"}.
- Arrival time: "we got there at 8", "arrived 8 AM", "left the shop at 7:30" → arrivalTime: "08:00".
- Departure time: "left at 4", "done by 3:30 PM", "finished around 4" → departureTime: "16:00".
- If arrival + departure given, calculate hours = departure minus arrival (subtract 0.5 for unpaid lunch if >5h).
- If hours explicitly stated: "worked 6 hours" → hours: 6.
- Do NOT invent rates. Leave rate null unless stated.

MATERIALS RULES:
- Capture every material with explicit quantity and unit: "14 squares of shingles" → {item:"shingles", quantity:"14", unit:"squares"}.
- "50,000 nails" → {item:"roofing nails", quantity:"50000", unit:"pieces"}.
- If unit price stated: "shingles at $85 a square" → cost: 85 * quantity.
- Do NOT invent quantities or costs.

TIMELINE RULES:
- Chronological events: departure from shop, arrival on site, work phases, breaks, departure from site.
- "We left at 8, got there at 8:30" → two timeline entries with times.

ISSUES: anything that's a blocker, safety concern, damage finding, or unexpected discovery.
Severity: "leak", "water", "structural", "mold" → high. "cracked", "damaged", "needs replacement" → medium. "cosmetic", "minor" → low.

CORRECTIONS (critical — do NOT do math, only flag intent):
- If the speaker is FIXING a previous entry — "actually it was 120 not 150", "scratch that, I meant 120", "correction, the 2x4s were 120", "the last note was wrong" — set the "correction" field.
- correction.item = the thing being corrected (e.g. "2x4s"). correction.newValue = the corrected number (e.g. 120). correction.field = "materials" or "labor".
- When you emit a correction, do NOT also put that item in the materials/labor arrays — the correction handles it. Only put NEW (non-correcting) items in the arrays.
- If it's NOT a correction (just a new delivery/usage), leave correction null and add to materials normally.

Return JSON with exactly these keys:
- timeline: [{time?: string, description: string}]
- materials: [{item: string, quantity?: string, unit?: string, cost?: number}]
- labor: [{description: string, hours?: number, rate?: number, arrivalTime?: string, departureTime?: string}]
- issues: [{description: string, severity: "low"|"medium"|"high"}]
- invoiceSuggestions: [{description: string, quantity: number, unitPrice: number, total: number}]
- correction: null OR {item: string, newValue: number, field: "materials"|"labor"}

If a section is empty, return []. Never fabricate data not explicitly stated. Never compute totals — the system sums quantities itself.`,
        },
        {
          role: "user",
          content: [
            `Business: ${options.businessName}`,
            contextBlock ? `Job context:\n${contextBlock}` : null,
            `Language detected: ${options.language ?? "en"}`,
            ``,
            `Field update:`,
            options.rawText,
          ]
            .filter((l) => l !== null)
            .join("\n"),
        },
      ],
    });
  } catch (err) {
    throw new ParseFieldUpdateError(
      `parseFieldUpdate: AI provider error — ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const rawContent = res.choices[0]?.message?.content ?? "{}";
  const schemaResult = parseFieldUpdateOutput(rawContent);

  if (!schemaResult.ok) {
    throw new ParseFieldUpdateError(
      `parseFieldUpdate: schema validation failed — ${schemaResult.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
      true,
      options.rawText,
    );
  }

  return schemaResult.data;
}

export interface GenerateFaqSuggestionsOptions {
  callSummary: string;
  businessName: string;
  existingFaqs: Array<{ question: string; answer: string }>;
}

export async function summarizeTranscript(
  options: SummarizeTranscriptOptions
): Promise<string> {
  const { client } = selectClient("summarize");

  if (!client) {
    if (isProduction()) {
      throw new Error("summarizeTranscript: DeepSeek provider not configured");
    }
    if (canUseMock()) {
      return `${mockLabel("summarize")}Call summary: Caller inquired about services and preferred appointment timing. Collected phone and address.`;
    }
    throw new Error("summarizeTranscript: DeepSeek provider not configured");
  }

  const lines = options.transcript
    .map((m) => `${m.role}: ${m.text}`)
    .join("\n");

  const { selection } = selectClient("summarize");

  let res;
  try {
    res = await client.chat.completions.create({
      model: selection.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a call summarizer for a local service business. Return JSON with keys: summary (2 sentences max), actionItems (array of strings). Be concise.",
        },
        {
          role: "user",
          content: `Business: ${options.businessName}\n\nTranscript:\n${lines}`,
        },
      ],
    });
  } catch (err) {
    throw new Error(`summarizeTranscript: AI provider error — ${err instanceof Error ? err.message : String(err)}`);
  }

  const rawContent = res.choices[0]?.message?.content ?? "{}";
  const schemaResult = parseSummaryOutput(rawContent);

  if (!schemaResult.ok) {
    return res.choices[0]?.message?.content ?? "";
  }

  const items = schemaResult.data.actionItems.length
    ? ` Action items: ${schemaResult.data.actionItems.join("; ")}`
    : "";
  return `${schemaResult.data.summary}${items}`;
}

export async function classifyCallOutcome(
  options: ClassifyOutcomeOptions
): Promise<{
  outcome: "scheduled" | "escalated" | "lead_captured" | "no_action";
  reason: string;
}> {
  const { client } = selectClient("classify");

  if (!client) {
    if (isProduction()) {
      throw new Error("classifyCallOutcome: DeepSeek provider not configured");
    }
    if (canUseMock()) {
      return { outcome: "lead_captured", reason: `${mockLabel("classify")}Caller provided contact info and service interest.` };
    }
    throw new Error("classifyCallOutcome: DeepSeek provider not configured");
  }

  const lines = options.transcript
    .map((m) => `${m.role}: ${m.text}`)
    .join("\n");

  const { selection } = selectClient("classify");

  let res;
  try {
    res = await client.chat.completions.create({
      model: selection.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Classify this service-business call. Return JSON with keys: outcome (one of: "scheduled", "escalated", "lead_captured", "no_action"), reason (1 sentence).',
        },
        {
          role: "user",
          content: `Business: ${options.businessName}\n\nTranscript:\n${lines}`,
        },
      ],
    });
  } catch (err) {
    throw new Error(`classifyCallOutcome: AI provider error — ${err instanceof Error ? err.message : String(err)}`);
  }

  const rawContent = res.choices[0]?.message?.content ?? "{}";
  const schemaResult = parseCallOutcomeOutput(rawContent);

  if (!schemaResult.ok) {
    return { outcome: "no_action", reason: "Classification failed." };
  }

  return schemaResult.data;
}

export async function generateFaqSuggestions(
  options: GenerateFaqSuggestionsOptions
): Promise<Array<{ question: string; answer: string }>> {
  const { client } = selectClient("faq-suggest");

  if (!client) {
    if (isProduction()) {
      throw new Error("generateFaqSuggestions: DeepSeek provider not configured");
    }
    if (canUseMock()) {
      return [
        {
          question: "Do you offer emergency services?",
          answer: `${mockLabel("faq-suggest")}Yes, we can typically respond to emergency calls same-day.`,
        },
      ];
    }
    throw new Error("generateFaqSuggestions: DeepSeek provider not configured");
  }

  const existingList = options.existingFaqs
    .map((f) => `Q: ${f.question}`)
    .join("\n");

  const { selection } = selectClient("faq-suggest");

  let res;
  try {
    res = await client.chat.completions.create({
      model: selection.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a local-service-business assistant. Based on the call summary, suggest new FAQ entries not already covered. Return JSON with key: suggestions (array of {question, answer} objects). Max 3 suggestions.",
        },
        {
          role: "user",
          content: `Business: ${options.businessName}\n\nCall Summary:\n${options.callSummary}\n\nExisting FAQs:\n${existingList}`,
        },
      ],
    });
  } catch (err) {
    throw new Error(`generateFaqSuggestions: AI provider error — ${err instanceof Error ? err.message : String(err)}`);
  }

  const rawContent = res.choices[0]?.message?.content ?? "{}";
  const schemaResult = parseFaqSuggestionsOutput(rawContent);

  if (!schemaResult.ok) {
    return [];
  }

  return schemaResult.data.suggestions;
}

// AI clients for back-office tasks (summaries, classification, FAQ generation, field parsing)
// parseFieldUpdate uses GPT-4o for accuracy; other functions use DeepSeek as a cheaper option

import OpenAI from "openai";
import type { ParsedUpdate } from "@/types/jobs";

// GPT-4o for field update parsing — more accurate structured extraction
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// DeepSeek for cheaper back-office tasks (summaries, classification)
const deepseek = process.env.DEEPSEEK_API_KEY
  ? new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
    })
  : null;

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
  language?: string;
  jobContext?: {
    title?: string;
    address?: string;
    serviceType?: string;
    clientName?: string;
  };
}

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

  // Prefer GPT-4o — better at structured extraction from messy voice transcripts
  const client = openai ?? deepseek;
  const model = openai ? "gpt-4o" : "deepseek-chat";
  if (!client) return empty;

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

  const res = await client.chat.completions.create({
    model,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a field intelligence analyst for a roofing company. A foreman or crew member has submitted a voice or text update from a job site. Your job is to extract structured data from their natural language — even if casual, abbreviated, accented, or in another language.

RULES:
- The update may be in any language. Parse it regardless of language.
- Preserve meaning, do not over-formalize.
- Times like "we got there at nine" → {time: "09:00"}. "left around 3" → {time: "15:00"}.
- Crew names mentioned = labor entries. Capture first names as descriptions: "Kevin and Billy are here" → two labor entries.
- Materials: capture quantities and units explicitly mentioned. "50 two-by-fours" → {item: "2x4 lumber", quantity: "50", unit: "pieces"}.
- Do NOT invent prices or rates. If not stated, leave cost/rate null.
- Issues: anything that's a problem, blocker, damage finding, or safety concern.
- Invoice suggestions: only when material quantities are clearly stated. Set unitPrice to null if not mentioned.
- Severity rules: "leak", "water damage", "structural" → high. "damaged", "needs replacement", "cracked" → medium. "cosmetic", "minor" → low.

Return JSON with exactly these keys:
- timeline: [{time?: string, description: string}]
- materials: [{item: string, quantity?: string, unit?: string, cost?: number}]
- labor: [{description: string, hours?: number, rate?: number}]
- issues: [{description: string, severity: "low"|"medium"|"high"}]
- invoiceSuggestions: [{description: string, quantity: number, unitPrice: number, total: number}]

If a section is empty, return []. Never fabricate data.`,
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

  try {
    const parsed = JSON.parse(res.choices[0].message.content ?? "{}");
    return {
      timeline: Array.isArray(parsed.timeline) ? parsed.timeline : [],
      materials: Array.isArray(parsed.materials) ? parsed.materials : [],
      labor: Array.isArray(parsed.labor) ? parsed.labor : [],
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      invoiceSuggestions: Array.isArray(parsed.invoiceSuggestions) ? parsed.invoiceSuggestions : [],
    };
  } catch {
    return empty;
  }
}

export interface GenerateFaqSuggestionsOptions {
  callSummary: string;
  businessName: string;
  existingFaqs: Array<{ question: string; answer: string }>;
}

export async function summarizeTranscript(
  options: SummarizeTranscriptOptions
): Promise<string> {
  if (!deepseek) {
    return "Call summary: Caller inquired about services and preferred appointment timing. Collected phone and address.";
  }

  const lines = options.transcript
    .map((m) => `${m.role}: ${m.text}`)
    .join("\n");

  const res = await deepseek.chat.completions.create({
    model: "deepseek-chat",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a call summarizer for a roofing company. Return JSON with keys: summary (2 sentences max), actionItems (array of strings). Be concise.",
      },
      {
        role: "user",
        content: `Business: ${options.businessName}\n\nTranscript:\n${lines}`,
      },
    ],
  });

  try {
    const parsed = JSON.parse(res.choices[0].message.content ?? "{}");
    const items = Array.isArray(parsed.actionItems)
      ? ` Action items: ${parsed.actionItems.join("; ")}`
      : "";
    return `${parsed.summary ?? ""}${items}`;
  } catch {
    return res.choices[0].message.content ?? "";
  }
}

export async function classifyCallOutcome(
  options: ClassifyOutcomeOptions
): Promise<{
  outcome: "scheduled" | "escalated" | "lead_captured" | "no_action";
  reason: string;
}> {
  if (!deepseek) {
    return { outcome: "lead_captured", reason: "Caller provided contact info and service interest." };
  }

  const lines = options.transcript
    .map((m) => `${m.role}: ${m.text}`)
    .join("\n");

  const res = await deepseek.chat.completions.create({
    model: "deepseek-chat",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Classify this roofing call. Return JSON with keys: outcome (one of: "scheduled", "escalated", "lead_captured", "no_action"), reason (1 sentence).',
      },
      {
        role: "user",
        content: `Business: ${options.businessName}\n\nTranscript:\n${lines}`,
      },
    ],
  });

  try {
    const parsed = JSON.parse(res.choices[0].message.content ?? "{}");
    const validOutcomes = ["scheduled", "escalated", "lead_captured", "no_action"];
    return {
      outcome: validOutcomes.includes(parsed.outcome) ? parsed.outcome : "no_action",
      reason: parsed.reason ?? "",
    };
  } catch {
    return { outcome: "no_action", reason: "Classification failed." };
  }
}

export async function generateFaqSuggestions(
  options: GenerateFaqSuggestionsOptions
): Promise<Array<{ question: string; answer: string }>> {
  if (!deepseek) {
    return [
      {
        question: "Do you offer emergency services?",
        answer: "Yes, we can typically respond to emergency calls same-day.",
      },
    ];
  }

  const existingList = options.existingFaqs
    .map((f) => `Q: ${f.question}`)
    .join("\n");

  const res = await deepseek.chat.completions.create({
    model: "deepseek-chat",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a roofing business assistant. Based on the call summary, suggest new FAQ entries not already covered. Return JSON with key: suggestions (array of {question, answer} objects). Max 3 suggestions.",
      },
      {
        role: "user",
        content: `Business: ${options.businessName}\n\nCall Summary:\n${options.callSummary}\n\nExisting FAQs:\n${existingList}`,
      },
    ],
  });

  try {
    const parsed = JSON.parse(res.choices[0].message.content ?? "{}");
    return Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  } catch {
    return [];
  }
}

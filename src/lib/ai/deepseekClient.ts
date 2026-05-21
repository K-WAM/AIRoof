// DeepSeek client for back-office tasks (summaries, classification, FAQ generation)
// Uses OpenAI-compatible SDK — not called during live phone calls

import OpenAI from "openai";

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

// DeepSeek client for back-office tasks (summaries, classification, drafts)
// Reserved for non-live operations to save costs

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

// Stub: Summarize call transcript
export async function summarizeTranscript(
  options: SummarizeTranscriptOptions
): Promise<string> {
  // TODO: Wire DeepSeek API when ready for back-office processing
  console.log("DeepSeek summary requested for:", options.businessName);

  // Mock for now
  return "Call summary: Caller inquired about services and preferred appointment timing. Collected phone and address.";
}

// Stub: Classify call outcome
export async function classifyCallOutcome(
  options: ClassifyOutcomeOptions
): Promise<{
  outcome: "scheduled" | "escalated" | "lead_captured" | "no_action";
  reason: string;
}> {
  // TODO: Wire DeepSeek API for intelligent outcome classification
  console.log("DeepSeek classification requested for:", options.businessName);

  // Mock for now
  return {
    outcome: "lead_captured",
    reason: "Caller provided contact info and service interest.",
  };
}

// Stub: Generate FAQ suggestions from calls
export async function generateFaqSuggestions(
  options: GenerateFaqSuggestionsOptions
): Promise<Array<{ question: string; answer: string }>> {
  // TODO: Wire DeepSeek API to analyze calls and suggest new FAQs
  console.log("DeepSeek FAQ generation requested for:", options.businessName);

  // Mock for now
  return [
    {
      question: "Do you offer emergency services?",
      answer: "Yes, we can typically respond to emergency calls same-day.",
    },
  ];
}

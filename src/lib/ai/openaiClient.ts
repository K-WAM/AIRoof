// OpenAI client for live agent responses
import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

export interface GenerateResponseOptions {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export async function generateAgentResponse(
  options: GenerateResponseOptions
): Promise<string> {
  const {
    systemPrompt,
    userMessage,
    model = process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature = 0.7,
    maxTokens = 150,
  } = options;

  if (!openai) {
    // Fallback safe mock response if key missing
    console.warn(
      "OpenAI API key not configured. Returning mock response."
    );
    return "I can help you schedule an appointment or leave a message for the team. How can I assist?";
  }

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return "I encountered an issue. Let me take a message for the team.";
    }

    return content;
  } catch (error) {
    console.error("OpenAI API error:", error);
    return "I encountered a technical issue. Let me take a message for the team.";
  }
}

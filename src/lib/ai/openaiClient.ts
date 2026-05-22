// OpenAI client for live agent responses
import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateResponseOptions {
  systemPrompt: string;
  userMessage: string;
  history?: ConversationTurn[];
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
    history = [],
    model = process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature = 0.7,
    maxTokens = 150,
  } = options;

  if (!openai) {
    console.warn("OpenAI API key not configured. Returning mock response.");
    return "I can help you schedule an appointment or leave a message for the team. How can I assist?";
  }

  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: userMessage },
    ];

    const response = await openai.chat.completions.create({
      model,
      messages,
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

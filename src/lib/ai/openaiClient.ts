import OpenAI from "openai";
import { selectClient, canUseMock, mockLabel, type ModelOverrides } from "@/lib/ai/registry";

const isProduction = (): boolean => process.env.NODE_ENV === "production";

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
  modelOverrides?: ModelOverrides;
}

export async function generateAgentResponse(
  options: GenerateResponseOptions
): Promise<string> {
  const {
    systemPrompt,
    userMessage,
    history = [],
    model: explicitModel,
    temperature = 0.7,
    maxTokens = 150,
    modelOverrides,
  } = options;

  const { client, selection } = selectClient("agent-respond", modelOverrides);

  if (!client) {
    if (isProduction()) {
      throw new Error("generateAgentResponse: OpenAI provider not configured");
    }
    if (canUseMock()) {
      return `${mockLabel("agent-respond")}I can help you schedule an appointment or leave a message for the team. How can I assist?`;
    }
    throw new Error("generateAgentResponse: OpenAI provider not configured");
  }

  const model = explicitModel || selection.model;

  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: userMessage },
    ];

    const response = await client.chat.completions.create({
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
    throw new Error(`generateAgentResponse: AI provider error — ${error instanceof Error ? error.message : String(error)}`);
  }
}

import type { BusinessConfig } from "@/types";
import { buildInitiationResponse } from "@/lib/voice/elevenlabs/initiationConfig";
import { buildTrialPrompt } from "./trialPrompt";

/**
 * A shared-demo-line call that joined a waiting demo page (claimArmedTrial): Alice answers with that page's business
 * name from the first word and follows the short private prompt. No code step (owner, 2026-10-16).
 */
export function trialPhoneInitiation(config: BusinessConfig, visitor: { name: string; email: string | null }, callerPhone: string | undefined, now = new Date()) {
  const response = buildInitiationResponse(config, callerPhone, now);
  response.conversation_config_override.agent!.prompt = { prompt: buildTrialPrompt(config, visitor, now, "phone") };
  return response;
}

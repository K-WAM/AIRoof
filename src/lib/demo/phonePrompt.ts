import type { BusinessConfig } from "@/types";
import { buildInitiationResponse } from "@/lib/voice/elevenlabs/initiationConfig";
import { buildTrialPrompt } from "./trialPrompt";

/**
 * A public self-led demo call keeps the "2 calls × 3 min" cap (T-224) even though the agent itself now allows 600 s
 * for real callers (T-230: full bookings ran 158–176 s and were about to hit the old agent-wide 180 s).
 */
export const TRIAL_PHONE_MAX_SECONDS = 180;

/**
 * A shared-demo-line call that joined a waiting demo page (claimArmedTrial): Alice answers with that page's business
 * name from the first word and follows the short private prompt. No code step (owner, 2026-10-16).
 */
export function trialPhoneInitiation(config: BusinessConfig, visitor: { name: string; email: string | null }, callerPhone: string | undefined, now = new Date()) {
  const response = buildInitiationResponse(config, callerPhone, now);
  response.conversation_config_override.agent!.prompt = { prompt: buildTrialPrompt(config, visitor, now, "phone") };
  response.conversation_config_override.conversation = { max_duration_seconds: TRIAL_PHONE_MAX_SECONDS };
  return response;
}

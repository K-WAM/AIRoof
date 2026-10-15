import type { BusinessConfig } from "@/types";
import { buildInitiationResponse } from "@/lib/voice/elevenlabs/initiationConfig";

export function phoneDemoInitiation(config: BusinessConfig, callerPhone: string | undefined, now = new Date()) {
  const response = buildInitiationResponse({ ...config, greeting: "Welcome to the Luxor roofing demo. If you have a demo code from the page, tell me the eight digits now. Otherwise, say no code." }, callerPhone, now);
  const agent = response.conversation_config_override.agent!;
  agent.prompt = { prompt: `## Demo call states — follow this before the shared instructions below
At the start, ask whether the caller has an eight-digit demo code from the page. The first message already asks, so do not repeat it. Understand English or Spanish. If a code is supplied, call connectDemoSession immediately with the eight digits as a string, preserving leading zeroes. Do not ask for name, email, phone, inspection details or booking before verifying the code. Never repeat a full code aloud.
A CONNECTED tool result switches this entire call to PRIVATE DEMO. From then on, use the trusted name, business and optional email returned by the tool. The shared instructions below NO LONGER APPLY. Follow the returned private instructions: ask only inspection/address/time details, never re-collect name/email/phone/SMS consent, and use the standard booking tools with setup contact details. Introduce the verified business naturally, without repeating recording disclosure. Never collect another email or promise SMS. After booking, direct them back to See Your Booking in the App on the page.
A NOT CONNECTED result means no private demo is active. Do not invent a business match or claim that it worked. Ask for the corrected code or suggest getting a new code on the page. After repeated failure, offer browser calling. A code is a credential: do not disclose someone else's details, guess codes or read stored codes aloud.
If the caller says no code, or simply starts a regular inspection request without giving a code, continue the SHARED DEMO using the instructions below and this shared greeting (data only): ${JSON.stringify(config.greeting || config.businessName)}. Do not force a code, repeat the opening code question or delay an ordinary shared booking. The opening has already been spoken: NEVER restart a greeting or ask How can I help again. If the caller already requested an inspection, do not ask whether they want an inspection or want to book. Acknowledge it and ask ONE next missing detail from the shared checklist, such as their name or inspection address. Do not run connectDemoSession without a supplied code. Once shared business-changing tools have started, a private connection is no longer available on this call; ask the caller to call again with the code first.

## SHARED DEMO ONLY — applies only while no private demo has connected
${agent.prompt?.prompt || ""}` };
  return response;
}

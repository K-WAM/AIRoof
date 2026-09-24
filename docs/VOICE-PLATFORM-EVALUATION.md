# Voice platform evaluation — should calls move from Vapi to the OpenAI API?

Written 2026-09-23 (owner asked to "consider OpenAI API for calls"). Pricing and product facts come from
OpenAI's docs plus third-party write-ups that were current in September 2026 — **re-verify prices before a
decision**; several figures below are estimates.

## What the phone stack is today

Caller → Vapi (telephony, STT Deepgram Flux, LLM gpt-4o-mini, TTS "Savannah", turn-taking, recording) →
our webhook `POST /api/webhooks/vapi` → the 7 tools in `src/lib/tools/agentTools.ts` → Firestore.
All-in cost about **$0.09–0.14/min**. The 7 tools, prompts, greetings, after-hours logic and per-tenant
persona push are **transport-agnostic** — only the webhook route and `vapiClient.ts` know about Vapi.

## The options

| | What changes | Voice quality | Effort / risk | Cost per min (rough) |
|---|---|---|---|---|
| **A. Keep Vapi, swap the TTS voice** (ElevenLabs / Cartesia) | One dashboard setting; persona pushes already preserve it | Big improvement over "Savannah" | ~1 hour, fully reversible | +a few cents (ElevenLabs/Cartesia pricing via Vapi — check) |
| **B. Vapi + OpenAI realtime model** (gpt-realtime-2.1 / 2.1-mini) | Model setting only | Most human (speech-to-speech) | Tried 2026-09-05..07 and **rolled back**: Vapi's tuned turn-taking (`startSpeakingPlan`/`stopSpeakingPlan`) doesn't govern speech-to-speech, callers got talked over. Newer models may behave better — unproven | Model ≈ $0.06–0.11 (2.1) or $0.02–0.05 (2.1-mini) **plus** Vapi's platform fee |
| **C. Direct OpenAI Realtime + SIP** (drop Vapi) | Rebuild the call layer (below) | Most human, full control | Weeks of work; new always-on infra; risk to live line | Model cost as B, minus Vapi fee, plus SIP/telephony (~1¢/min, verify) |
| **D. OpenAI "GPT-Live-1"** (new, GA 2026-09-10) | Full-duplex voice layer, delegates reasoning to a backend model | Very natural, real interruption | 13 days old; **no documented SIP/phone support**, only WebRTC/`live/sessions` | $0.05/min voice layer **plus** backend model tokens; meter runs through silence |

## What option C actually requires (the honest list)

OpenAI's SIP support is **inbound only** ("creating an outbound SIP call … is not supported" — use Twilio/Telnyx).
Flow: caller → your SIP trunk (Twilio/Telnyx number) → `sip:<project>@sip.api.openai.com` → OpenAI POSTs a
`realtime.call.incoming` webhook → we `accept` with instructions/voice/tools (this replaces Vapi's
`assistant-request`, and is easy) → **tool calls and session control run over a WebSocket held open for the
whole call**.

That last point is the architectural blocker: **Vercel serverless functions cannot hold a WebSocket open for a
call**. We would need a small always-on service (Fly.io / Railway / Cloud Run) per region, with reconnect,
health checks and deploy discipline — a category of operational work this project doesn't have today.

Also to rebuild that Vapi does for us now:
- number purchase/porting and per-tenant routing (Twilio/Telnyx API + our `resolveBusinessId` mapping);
- **outbound calls** (callbacks, follow-ups) via Twilio, bridged to OpenAI;
- **recording and transcripts** (OpenAI docs specify none — we'd capture audio at the trunk/WebSocket and build the
  transcript + `end-of-call-report` equivalent ourselves; ties directly into the NH-4 legal work);
- call transfer/escalation (`refer` exists), voicemail/no-answer handling, retries, spend guards, abuse limits;
- monitoring/alerting comparable to T-065's webhook-health cron.

## What we would gain

- The most natural voice available (cedar/marin-class speech-to-speech), and real interruption handling.
- One fewer vendor; potentially lower per-minute cost at scale (no Vapi platform fee).
- Full control of the call lifecycle.

## Recommendation (staged, each stage reversible and gated)

1. **Now — Option A.** Swap the Vapi voice to ElevenLabs/Cartesia and do a real test call. Costs nothing to
   undo and may resolve "doesn't sound human" outright. (Owner steps: `NEEDS-HUMAN-CHECKLIST.md`, voice section.)
2. **Then — Option B as a side-by-side test, never on the live line:** create a *second* Vapi assistant + number
   on `gpt-realtime-2.1-mini`, point it at a test tenant, and run 20 scripted calls (interruptions, long
   answers, the NH-18 adversarial set). Success = zero talk-over incidents and a measured cost per call. This
   answers "did turn-taking get fixed?" with data instead of a rollback.
3. **Only if 1 and 2 don't satisfy — Option C spike:** a research branch with a thin `CallTransport`
   adapter (Vapi | OpenAI-SIP) so `agentTools.ts` is reused unchanged, one always-on relay service, one test
   number, inbound only, behind a per-business `voiceProvider` flag defaulting to Vapi. Decision gate after
   the spike: reliability over 50+ calls, recording/transcript parity, monthly ops cost. Do **not** start this
   before NH-1/NH-3/NH-4/NH-8 are closed — the live product's verification debt is the bigger risk right now.
4. Watch **Option D** (GPT-Live-1) — revisit when it documents phone/SIP support and has a few months of
   production history.

## Parked task (not started, not assigned)

**T-104 (optional) — OpenAI voice A/B harness**: a script + test-tenant setup for stage 2 (create test
assistant on a realtime model, run a scripted call list, compare turn-taking/cost against the live config).
Assign only after the owner has tried Option A.

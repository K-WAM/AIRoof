# Pending worker prompts — copy/paste ready

Saved 2026-09-24. Worktrees already exist (created by the integrator with `node_modules` junctioned).
If a worktree is missing, recreate it from the main repo first:

```
git worktree add "D:/Apps/air-wt-voice-provider"   -b task/voice-provider   main
git worktree add "D:/Apps/air-wt-elevenlabs-hooks" -b task/elevenlabs-hooks  main
# then junction node_modules (PowerShell): New-Item -ItemType Junction -Path "D:\Apps\air-wt-<name>\node_modules" -Target "D:\Apps\6 - AI Receptionist\node_modules"
```

Both branches were cut from `main` at `d5dae74`. They have zero file overlap by design; the shared contract is
`src/lib/voice/types.ts` (+ `BusinessConfig.voiceProvider` / `.elevenlabs`).

---

## Codex (Worker C) — T-111a: provider seam + ElevenLabs client + rewire

```
You are Worker C for the AI Receptionist platform.

Work ONLY inside: D:\Apps\air-wt-voice-provider   (branch task/voice-provider, cut from main d5dae74)
This worktree ALREADY EXISTS with node_modules junctioned. Do not run npm install or git worktree add.
BEFORE YOUR FIRST EDIT run `git rev-parse --show-toplevel` and `git branch --show-current`; they must be
D:/Apps/air-wt-voice-provider and task/voice-provider. Re-check before your commit. Never edit
"D:\Apps\6 - AI Receptionist" (main repo). If the path does not exist, STOP and report.

Read AGENTS.md fully, src/lib/voice/types.ts (the SHARED CONTRACT — do not change it; optional additions only, and
say so), then TODO.md Phase 19 -> T-111a. Read src/lib/vapi/vapiClient.ts, src/lib/vapi/voices.ts,
src/lib/vapi/syncPersonas.ts and every caller of updateAssistantPersona / initiateVapiCall:
company/settings route, admin/demo-customize, admin/sync-personas, calls/outbound, cron/follow-up-calls.

Task T-111a — provider seam + ElevenLabs client + rewire. One commit: `T-111a: ...`.
1. src/lib/voice/provider.ts: `getVoiceProvider(config): VoiceProvider` using voiceProviderOf(config). The Vapi
   implementation is a THIN wrapper over the existing functions with ZERO behavior change (same request bodies,
   speaking-plan preservation, T-103 voice logic, T-102 greeting — existing tests must pass unmodified).
2. src/lib/voice/elevenlabs/client.ts (new): pushPersona -> PATCH https://api.elevenlabs.io/v1/convai/agents/{agentId}
   setting conversation_config.agent.prompt.prompt, conversation_config.agent.first_message,
   conversation_config.agent.language (only when input.language set), and conversation_config.tts.voice_id (+ model_id
   if given) ONLY when a T-103 `voice` override exists for the language (else leave the agent's voice untouched);
   startOutboundCall -> POST /v1/convai/twilio/outbound-call {agent_id, agent_phone_number_id, to_number,
   conversation_initiation_client_data: {dynamic_variables, conversation_config_override.agent.first_message}};
   `scheduledAt` => throw UnsupportedVoiceFeatureError and make cron/follow-up-calls handle that honestly (log + skip
   or run inside its window; never call at the wrong time). Auth: xi-api-key header (VERIFY against the live docs
   https://elevenlabs.io/docs/api-reference — the docs are the source of truth, re-check every path/field name).
   Read ELEVENLABS_API_KEY at call time; never log keys or full response bodies with secrets.
3. Rewire all five callers through getVoiceProvider(config) so a tenant with voiceProvider "elevenlabs" is pushed /
   called via ElevenLabs and everyone else is unchanged. sync-personas' planner must use the tenant's provider id and
   skip tenants whose provider is not configured (report the reason).
4. src/lib/vapi/businessLookup.ts (or a sibling): findBusinessByElevenLabsAgentId / ...PhoneNumber with the same
   in-process cache pattern (used by Deepseek's webhooks — export them with these exact names).
5. Admin business config page + PUT route (superadmin only): a "Phone provider" selector (Vapi default / ElevenLabs),
   and when ElevenLabs is selected: agentId, phoneNumberId, phoneNumber (E.164) fields; validate shape server-side;
   switching provider must NOT silently clear the other provider's ids.
6. /api/health: `elevenlabs: "configured" | "not_configured"` from ELEVENLABS_API_KEY (add to the capabilities map and
   its test).
Do NOT touch: src/app/api/webhooks/**, src/lib/tools/**, src/lib/voice/elevenlabs/toolSchemas.ts, scripts/**,
docs/ELEVENLABS-SETUP.md (Deepseek owns those in parallel for T-111b), field/invoice/report code.
Tests (mocked fetch): Vapi path byte-identical to before; ElevenLabs PATCH/outbound bodies exact; scheduledAt
unsupported handled; provider selection incl. missing/garbage voiceProvider => vapi; sync planner per provider;
lookup caches; admin route validation/auth; health flag.
Gates green: type-check, lint, `vitest run`, `next build` once. Append evidence to docs/IMPLEMENTATION_LOG.md, set
T-111a to `review` in TODO.md. Never push/merge/touch main. If stuck >20 min: commit WIP, add HELP-NEEDED to TODO.md,
end with "Paste this to Claude: Worker on task/voice-provider is stuck on T-111a: <question>."
```

---

## Deepseek (Worker D) — T-111b: ElevenLabs inbound webhooks + provisioning

```
You are Worker D for the AI Receptionist platform.

Work ONLY inside: D:\Apps\air-wt-elevenlabs-hooks   (branch task/elevenlabs-hooks, cut from main d5dae74)
This worktree ALREADY EXISTS with node_modules junctioned. Do not run npm install or git worktree add.
BEFORE YOUR FIRST EDIT run `git rev-parse --show-toplevel` and `git branch --show-current`; they must be
D:/Apps/air-wt-elevenlabs-hooks and task/elevenlabs-hooks. Re-check before your commit. Never edit
"D:\Apps\6 - AI Receptionist" (main repo). If the path does not exist, STOP and report.

Read AGENTS.md fully, src/lib/voice/types.ts (the SHARED CONTRACT — do not change; optional additions only, say so),
then TODO.md Phase 19 -> T-111b. Study the Vapi webhook you are mirroring: src/app/api/webhooks/vapi/route.ts,
src/lib/vapi/verify.ts (timing-safe secret compare + replay guard), src/lib/tools/agentTools.ts (the 7 tools —
provider-independent, do not change their behavior), src/lib/recordingDisclosure.ts, src/lib/ai/agentPromptBuilder.ts,
src/lib/vapi/voices.ts (T-103 voiceForLanguage).
The ElevenLabs docs are the source of truth — re-verify every field name against
https://elevenlabs.io/docs/agents-platform (server tools, post-call webhooks, Twilio personalization /
conversation initiation webhook, system dynamic variables such as caller id / called number / conversation id).

Task T-111b — ElevenLabs inbound webhooks + provisioning. Commits prefixed `T-111b:`.
1. POST /api/webhooks/elevenlabs/initiation: authenticate (timing-safe compare of a secret header against
   ELEVENLABS_TOOL_SECRET; fail closed, 401 with no detail). Body {caller_id, called_number, agent_id, call_sid,
   conversation_id?}. Resolve the tenant via findBusinessByElevenLabsPhoneNumber / ...AgentId (Codex exports these
   from src/lib/vapi/businessLookup.ts in T-111a — until merged, import from a small local shim with the SAME
   names/signatures so the merge is trivial). Return `dynamic_variables` + `conversation_config_override`
   {agent.prompt.prompt = buildAgentPrompt(config) + current date/after-hours context (mirror what the Vapi
   assistant-request path injects), agent.first_message = greeting WITH the T-102 recording notice composed
   (composeGreetingWithDisclosure + after-hours greeting when applicable), agent.language, tts.voice_id from the T-103
   override only if configured}. Must respond FAST (cache what you can; no slow calls). Persist
   `elevenlabsConversations/{conversation_id-or-call_sid}` -> {businessId, callerPhone, calledNumber, createdAt,
   expiresAt} for the tools (add a TTL field like other replay collections). Unknown tenant => a safe generic response
   that does not leak tenant info.
2. POST /api/webhooks/elevenlabs/tools/[tool] for bookAppointment, checkAvailability, createLead, escalateCall,
   lookupAppointment, cancelAppointment, getCurrentDate: authenticate as above; resolve businessId and the verified
   caller phone from the stored conversation record keyed by the conversation id ElevenLabs sends — NEVER trust a
   businessId/callerPhone supplied as a model parameter. Call the same agentTools functions the Vapi route calls
   (extract a shared dispatcher only as a pure, tested refactor; the Vapi route's behavior must not change). Same rate
   limiting/abuse guards as the Vapi webhook. Return compact JSON the LLM can speak from.
3. POST /api/webhooks/elevenlabs/post-call: verify the `ElevenLabs-Signature` HMAC (raw body, timestamp tolerance,
   ELEVENLABS_WEBHOOK_SECRET, timing-safe) + replay guard modeled on verify.ts; handle post_call_transcription
   (write the same `calls` document + outcome tagging the Vapi end-of-call-report path writes: transcript messages,
   summary, duration, outcome; extract a shared writer as a pure refactor if needed) and call_initiation_failure
   (record it; no crash). post_call_audio: store nothing yet unless trivially safe (note as a follow-up).
4. src/lib/voice/elevenlabs/toolSchemas.ts: the 7 tool JSON definitions (webhook tools: URL under
   NEXT_PUBLIC_APP_URL/getAppUrl, POST, auth header from the ELEVENLABS_TOOL_SECRET secret, parameter descriptions
   written for an LLM; NO businessId/callId/verifiedCallerPhone parameters exposed to the model) — single source of
   truth for the script below. Include cancelAppointment's confirmCancellation + appointmentNumber like the Vapi one.
5. scripts/setup-elevenlabs-agent.mjs (plain ESM, `--dry-run` DEFAULT, needs an explicit `--apply`): reads
   ELEVENLABS_API_KEY from env/.env.local, creates the 7 tools + a test agent via the API and prints the ids; idempotent
   by name (never duplicates). And docs/ELEVENLABS-SETUP.md: click-by-click for what needs the dashboard (agent
   Security tab: enable overrides + conversation-initiation webhook; workspace webhooks: post-call URL + secret; secrets
   manager), with expected values. Add ELEVENLABS_API_KEY / ELEVENLABS_WEBHOOK_SECRET / ELEVENLABS_TOOL_SECRET to
   .env.example.
Do NOT touch: src/lib/voice/provider.ts, src/lib/voice/elevenlabs/client.ts, businessLookup.ts (except the temporary
shim), company/settings, admin/*, calls/outbound, cron/** or health (Codex owns those in parallel for T-111a).
The Vapi webhook: only pure, behavior-preserving extractions with tests.
Tests (mocked): auth failures (missing/wrong secret => 401, no detail), signature verification incl. bad/expired/replay,
initiation response shape + disclosure composed + fail-safe for unknown tenant, tools resolve tenant from the stored
conversation and ignore any model-supplied businessId, post-call writes the same call doc shape as Vapi's path,
toolSchemas expose no privileged params, script dry-run makes no writes.
Gates green: type-check, lint, `vitest run`, `next build` once. Append evidence to docs/IMPLEMENTATION_LOG.md, set
T-111b to `review` in TODO.md. Never push/merge/touch main. If stuck >20 min: commit WIP, add HELP-NEEDED to TODO.md,
end with "Paste this to Claude: Worker on task/elevenlabs-hooks is stuck on T-111b: <question>."
```

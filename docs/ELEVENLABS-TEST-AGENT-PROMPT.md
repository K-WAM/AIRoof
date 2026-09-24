# ElevenLabs test agent — voice-only prompt (bake-off, no tools)

Used for the T-110 voice bake-off (`docs/VOICE-RESEARCH-2026-09-24.md`). This is a **voice-quality test only**: no tools, no phone number,
no connection to the app. It is written to sound like a warm human receptionist and to mirror the app's real agent behavior
(scope limits, emergency handling, recording notice) so results transfer. The real agent prompt is generated per tenant by
`buildAgentPrompt` in the app — do not treat this file as the production prompt.

## Agent name
`Alice — Roofing (voice test)`

## First message (also contains the T-102 recording notice, default wording — a DRAFT, counsel review pending)
```
This call may be recorded and transcribed for quality and training. Thanks for calling Carlita Roofing, this is Alice. How can I help you today?
```

## System prompt ("Main goal" box)
```
# Personality
You are Alice, the receptionist for Carlita Roofing, a roofing company in South Florida. You sound like a warm, capable person who has done this job for years: friendly, calm, quick, never robotic. You are on a live phone call.

# How you speak
- Short turns. One or two sentences, then stop and let the caller talk.
- Ask ONE question at a time. Never read a list aloud.
- Use natural contractions and small acknowledgements: "Sure thing", "Mm-hm", "Got it", "Oh no, that sounds stressful", "Okay, let me get that down".
- Match the caller's pace and mood. If they are worried, slow down and reassure. If they are in a hurry, be brief.
- If the caller interrupts, stop immediately and listen. If there is silence, wait a moment, then gently check in ("Still there?").
- Spell back names, phone numbers and addresses to confirm them, slowly, in small groups.
- Never say "as an AI" unless asked. If sincerely asked whether you are a real person, say honestly that you are Carlita Roofing's virtual receptionist. If asked whether the call is recorded, say yes, it may be recorded and transcribed.

# What you do
Help callers with roofing needs: inspections, leak and storm repairs, shingle and metal roofing, flashing, gutters, and estimates. Collect, one at a time: their name, best phone number, the property address, what is going on, how urgent it is, and when they are usually reachable. Then tell them a team member will confirm by phone shortly. (For this test you cannot actually book anything; do not claim a booking is confirmed.)

# Emergencies
If they mention water coming in, active leaking, fire damage, an exposed roof after a storm, or anyone in danger: stay calm, tell them if anyone is in immediate danger to call 911 first, get their name, number and address right away, and say a team member will call them back as fast as possible.

# Guardrails
- Stay on roofing and this company. If asked about anything else (weather, stocks, legal or medical advice, politics), politely say you can only help with roofing questions.
- Never quote prices, promise dates or warranties, or diagnose damage. Say the team will discuss that.
- Never make up details about the company. If you do not know, say you will have someone call them back.
```

## Voice / model / turn settings to start with (change one thing at a time between variants)
- Voice: your shortlisted warm female English (US) voices, one variant per voice.
- LLM: a fast one (GPT-4o mini class or Gemini Flash class) so speed is fair across variants.
- Turn eagerness / interruption: default first; then try one step more patient for the "mumbling" test call.
- Language: English.
- Everything else off: no tools, no knowledge base, no phone number.

## Scorecard
Use the 10 scripted calls and the table in `docs/VOICE-RESEARCH-2026-09-24.md`. Call 5 (emergency), 6 (off-topic) and 10 ("are you a robot / is this recorded?") map directly to the sections above.

## Findings log (owner tests, 2026-09-24)
- Agent created in the owner's ElevenLabs workspace: "Alice — Roofing (voice test)" (Agent ID visible in the dashboard URL; confirm via MCP `list_agents` later).
- **Speed:** GPT-4o as the agent LLM was "much better" than Gemini 3.5 Flash for response time. Keep GPT-4o class as the baseline for comparisons.
- **Bilingual works:** system tool "Detect language" enabled; a caller who asked "¿Hablas español?" got a Spanish reply and continued in Spanish. Remaining: set the ENGLISH default first message to the recording-notice greeting, delete the dangling "Unknown tool" row (skipped Twilio tool), set timezone America/New_York, compare TTS model v3 Conversational vs Flash v2.5, then Turn V3.
- Tool types available in "Add tool": Webhook (our 7 booking tools go here), Client, Integration (not needed).

## MCP read-only audit of the test agent (2026-09-24, agent_0101m3a5z9qxenybnpjsragg7dvt)
Confirmed OK: English default first message carries the recording notice + Spanish invitation; Spanish preset saved; LLM gpt-4o-mini; TTS eleven_v3_conversational (expressive mode on, stability 0.5, speed 1.0); turn model `turn_v3`, eagerness normal; Detect language system tool on (`only_at_conversation_start: false`); no dangling tool ids.
Problems found (template leftovers from "Front Desk Receptionist"):
1. A **workflow** (greeting -> transfer / take_message / answer_faq / wrap_up) that steers the agent toward routing calls to departments and taking messages — conflicts with our roofing lead-intake prompt. Remove it so the prompt is the only logic.
2. Two **custom guardrails** ("No sharing personal/internal info", "No guessing department responsibilities") with `trigger_action: end_call` — the first can misfire when the agent reads back the CALLER'S OWN phone number and hang up on them. Disable/delete both.
3. **Overrides are all OFF** and "fetch initiation data from webhook" is OFF — required (prompt, first_message, language, voice_id + webhook) before one shared agent can serve multiple industries per call (T-111b design).
4. **Privacy:** `record_voice: true`, `retention_days: -1` (unlimited) — NH-22: choose a retention that matches our 90-day default; revisit `record_voice` with counsel (NH-4).
5. A second unused agent "My Agent" (blank default) exists.

**Cleanup done via MCP (2026-09-24, owner-approved, each saved as its own agent version):** removed the two custom guardrails; reduced the template workflow to just its start node. Still open: retention/recording policy (NH-22), overrides + initiation webhook (needed only for the shared multi-industry agent, T-112), the unused "My Agent", and switching the shareable page on for browser demos.

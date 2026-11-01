# ElevenLabs phone agent — playbook (read before changing the agent)

Owner's request (2026-10-31): "remember the ElevenLabs best practices so we don't keep running into this."
Every rule below comes from a real failure on the live line. Change this file when a rule changes.

## Reference

- ElevenLabs Agents docs: https://elevenlabs.io/docs/eleven-agents/overview
- Prompting guide: https://elevenlabs.io/docs/agents-platform/best-practices/prompting-guide
- REST host for this workspace: `https://api.us.elevenlabs.io` (the global host hangs). Key: `ELEVENLABS_API_KEY` in `.env.local`
  and Vercel — never print it.
- "GA" in ElevenLabs release notes = **Generally Available** (out of beta, supported for production).

## Which agent is which

| Agent | ID | Use |
|---|---|---|
| **Alice — LIVE roofing demo line (689 / 778)** | `agent_0101m3a5z9qxenybnpjsragg7dvt` | Answers +1 (689) 204-2643 and the Canadian 778 line. It started life as a voice test (old name "Alice — Roofing (voice test)"); it is the live line. |
| Luxor Roofing Private Browser Demo | `agent_4301m4y2s2fce18sgxfagn3wjh2j` | Browser demo on the website |
| Luxor FrontDesk Website Demo | `agent_1701m58wy7tye02syp9yvvh540ha` | Website widget |
| My Agent | `agent_1601m3a46ce9fafsyrxy4jz7zky7` | Unused default |

Test branch on the live agent (never takes calls): `agtbrch_9601m67n0mr3eawv3n43yn4cjpvt`.

## Where the greeting and prompt really live

**Not in the ElevenLabs dashboard.** At the start of every call our initiation webhook
(`src/app/api/webhooks/elevenlabs/initiation/route.ts`) sends that business's own greeting and full prompt, built from the
business's settings in our app (`buildInitiationResponse` → `phoneGreeting()` + `buildAgentPrompt()`). The dashboard's
"First message" and "System prompt" are only a fallback if our server is down — that is why the dashboard says "Carlita
Roofing" while callers hear the real business name. To change what Alice says: change the business's settings or the code.

Greeting shape (T-231): `Hi!` → hello → recording notice → `También hablamos español.` → the question **last**, so the
caller knows it's their turn. No after-hours speech in the greeting.

## Settings baseline (live, 2026-10-31)

| Setting | Value | Why |
|---|---|---|
| LLM | `gpt-4o` (fallback tested: `gemini-2.5-flash`, thinking 0) | Natural turn-taking; gpt-4o retires from OpenAI's API 2027-01-14 — move before then |
| Parallel tool calls | **OFF** | ON made her check the calendar while asking a question and answer herself |
| `end_call` description | "only after the caller says goodbye…" | gpt-6-luna hung up mid-booking |
| TTS | eleven_v3_conversational, **expressive mode OFF**, no suggested audio tags, speed 0.92, stability 0.6 | Expressive/tags made her rushed and performed |
| Soft timeout (filler) | 2.0 s, LLM-generated, English unless the caller's own last words were Spanish | Covers calendar waits; the old prompt made it say Spanish to English callers |
| Turn eagerness | normal; speculative turn ON | "patient" adds delay to every turn |
| Max call length | 600 s (public trial calls 180 s via per-call override) | Bookings take ~2–3 min |
| Knowledge base | none | Each call already gets the business's info from our app; a KB adds lookup delay |
| Workflows / Procedures | not used | One prompt is enough for a receptionist; revisit only for multi-department routing |

## Never do (each one broke a live call)

1. Switch the LLM, or turn on parallel tool calls, without running the simulation tests below first.
2. Use `gpt-6-luna` (worst in our tests: 39/66, hung up mid-booking) or `gpt-4o-mini` (said "booked" without saving).
   Anthropic models fail on this workspace and silently fall back to Gemini — check `producing_llm`.
3. Turn expressive mode/audio tags back on for the phone line.
4. Put the business's information in the ElevenLabs knowledge base.
5. Edit the live agent to test an idea — use the test branch.

## How to change the agent safely

1. Put the change on the test branch (`?branch_id=agtbrch_9601m67n0mr3eawv3n43yn4cjpvt`), with the **real prompt** copied from a
   recent call's `conversation_initiation_client_data` (the stored dashboard prompt is a placeholder).
2. Run the multi-turn **simulation** tests "Natural 1031" (`test_3601m6a3zdn4fr89jvx45fhfeatj` Monday booking,
   `test_7901m6a3zdw8fdqab930zxrevgez` change to Tuesday, `test_1701m6a3zdz8fkws6qfjzh4f2ezk` Spanish) ×4 via
   `POST /v1/convai/agents/{id}/run-tests` with `branch_id`. Bar: 12/12, no early `end_call`.
3. Run the booking-rule tests (23 single-turn tests, list in `docs/IMPLEMENTATION_LOG.md` T-231) ×2; compare with the current model.
4. Compare speed (`convai_llm_service_ttfb` p50) **and cost** (`llm_price` per call) — gpt-4o is ~$0.09/min of LLM, Gemini ~$0.005.
5. Apply to the live agent, read it back, note the new `version_id` (rollback) in `docs/SESSION_HANDOFF.md`.
6. Make one real call and read the transcript before calling it fixed.

## Cost per call (measured 2026-10-31)

- Voice (ElevenLabs platform): ~$0.08/min (~440 credits/min).
- LLM: gpt-4o ~$0.09/min (~530 credits/min, the 22k-token prompt is re-read every turn); gemini-2.5-flash ~$0.005/min.
- So a 3-minute call ≈ **$0.52 on gpt-4o, ≈ $0.26 on Gemini**. Twilio adds ~$0.01/min + ~$1.15/month per number.
- Unit rates the Usage page uses live only in `src/lib/billing/aiCostRates.ts`.

## Credits, renewal and keys (outage risks)

- Plan: **Creator**, 214,953 credits/month, next reset **2026-11-24** (`GET /v1/user/subscription`). This plan **cannot go
  over its credits — when they run out, the phone line stops answering.** Check the balance weekly while testing; a client
  with ~900 call-minutes/month needs ~450k (Gemini) to ~870k (gpt-4o) credits/month → a bigger plan before go-live.
- API key: ElevenLabs keys do not expire unless an expiry was set when the key was created. Check ElevenLabs → Developers →
  API keys; if it shows an expiry, record it in `app-status.json` deadlines and rotate it (Vercel env + `.env.local`) a week early.
- Twilio numbers renew monthly on the Twilio card — a failed card drops the number.

## New ElevenLabs features (assessed 2026-10-31)

| Feature | Use for us? |
|---|---|
| V3 Conversational GA | Already our voice model |
| Scribe v2 Realtime default ASR | Already in use |
| Procedures GA (step-by-step playbooks) | Not now — our prompt + server rules cover booking |
| Workflows | Not now — adds a second place for logic |
| Gemini 3.7 Flash | Candidate to replace gpt-4o — run the simulation tests first |
| Language detection only at call start | No — it would block a caller switching to Spanish mid-call |
| Disable interruptions while a tool runs | Maybe — try on the test branch if callers' "uh-huh" cuts off booking replies |
| Audio filters (e.g. phone) | No |
| Preview past agent versions | Useful for rollback checks |

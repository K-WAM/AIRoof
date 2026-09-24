# Voice quality research + bake-off plan — 2026-09-24

Goal (owner): a phone AI that sounds **really human**. Vapi "sounds dull". Tomorrow (2026-09-25) we test end to end.
This complements `docs/VOICE-PLATFORM-EVALUATION.md` (the build-vs-buy analysis) — this file is the *shortlist and test plan*.

> **Read this caveat first.** Almost every ranking below is a vendor blog or an affiliate comparison. They agree
> on the broad picture but disagree on numbers. **The only ranking that matters is our own scripted calls, blind-rated.**
> Prices move monthly — confirm on the vendor's page before committing budget.

## Why Vapi sounds dull (and what that does and doesn't mean)

Vapi is orchestration: it stitches a transcriber (Deepgram Flux), an LLM (gpt-4o-mini) and a voice (currently Vapi's
own "Savannah") together. The **voice** is the biggest single factor in "human-ness" and it is a swappable setting,
not a platform limit. Other contributors we control: the prompt's speaking style (short sentences, contractions,
acknowledgements like "mm-hm", no list-reading), latency, and interruption handling. So there are two separate
questions: (1) is a better *voice* enough, and (2) do we need a better *platform/pipeline* (speech-to-speech).

## The candidates

| # | Option | What it is | Human-ness evidence | Rough cost/min | Fit with our stack |
|---|---|---|---|---|---|
| A | **Vapi + ElevenLabs voice** (Flash v2.5 / v3 conversational) | Same plumbing, best-rated TTS | ElevenLabs is the most consistently named "most natural" (MOS ≈ 4.2–4.4 vs ~4.5–4.8 for humans; "frequently mistaken for real humans" in blind tests) | Vapi ~$0.05 + provider costs; roughly $0.10–0.19 all-in | **Zero code.** Our webhook, 7 tools, persona push all unchanged; T-103 voice override already stores it |
| B | **Vapi + Cartesia Sonic-3** | Fast streaming TTS | Very good, tuned for low latency (~90 ms first audio) | similar to A, slightly less | Zero code |
| C | **ElevenLabs Agents** (ElevenAgents) | ElevenLabs' own full agent platform: its voice + its own turn-taking model + Twilio/SIP telephony | Best raw voice; fastest median turn latency in one third-party test (~1.7 s); a "turn-taking model" reads cues like "um"/"ah" so it doesn't cut callers off | **$0.08/min on every tier + LLM + telephony** (extra) | Medium: tools become server webhooks (our 7 tools already are HTTP handlers); per-call context via dynamic variables; recording/transcripts included; outbound via Twilio; answering-machine detection exists |
| D | **Retell AI** | Vapi-like orchestration, developer-first | Highest repeatable task-completion (96.6%) in one test; supports ElevenLabs v3 / Cartesia / OpenAI voices | $0.07 base; **realistic $0.13–0.15**, ~$0.19 with premium voice + Claude | Easy migration (custom-function webhooks, phone numbers), a "second Vapi" — mainly worth it if its turn-taking is better |
| E | **OpenAI Realtime** (gpt-realtime-2.1 / 2.1-mini) | Speech-to-speech; natural prosody, interruption handled natively | Very natural; 300–600 ms; but you tried it via Vapi and turn-taking broke | Model only ≈ $0.06–0.11 (2.1) / $0.02–0.05 (mini), + telephony | Via Vapi: setting change (retest — models are newer). Direct: SIP inbound only + a **persistent WebSocket server** (Vercel can't) — see evaluation doc |
| F | **Hume EVI 3** | Empathic speech-to-speech | Blind-rated above GPT-4o for empathy/naturalness (vendor test) | not confirmed | **Poor fit for tool-heavy booking**: Twilio direct-connect cannot do tool calls; needs your own bridging server |
| G | **Gemini Live** (native audio, GA on Vertex) | Google speech-to-speech, affective dialog, barge-in, 70 languages | Strong; very cheap (~$0.02–0.03/min audio at Flash Live prices) | cheapest | No direct SIP: needs Twilio + Pipecat/LiveKit bridge + our own server |
| H | **Amazon Nova Sonic** | AWS speech-to-speech, senses tone | Won ~51% head-to-head vs GPT-4o Realtime in Amazon's own test; ~1.1 s latency | ~80% cheaper than GPT-4o Realtime (vendor claim) | AWS-only plumbing; own server |
| I | **GPT-Live-1** (OpenAI, GA 2026-09-10) | Full-duplex voice layer delegating reasoning to a backend model | Real interruption without turn handoff | $0.05/min voice **+** backend model tokens; meter runs through silence | 2 weeks old, **no documented phone/SIP** — watch, don't test yet |
| — | PolyAI / Bland / Synthflow / LuMay etc. | Managed agent vendors | PolyAI rated top for enterprise dialogue | PolyAI $25–50K+; others $0.09–0.12+ | Poor fit (closed, per-call scripting, enterprise pricing) |

### My honest read
- **A/B first.** If the *voice* is what sounds dull, ElevenLabs on our existing Vapi assistant fixes it in an hour and risks nothing.
- **C (ElevenLabs Agents) is the serious "leave Vapi" candidate**, because it combines the best voice with an integrated turn-taking model and managed telephony — the two things that make calls feel human — without us building a WebSocket relay. It costs more per minute; that's the trade for quality.
- **D (Retell)** only if C disappoints.
- **E/F/G/H (speech-to-speech)** are the most *emotionally* natural in principle but all need our own always-on server for tool use, and E already failed once for turn-taking. Don't lead with them.
- Booking calls are a tools-and-precision job (dates, spelling names/addresses back, confirming). "Human" here = warm pacing, no dead air, no talking over the caller, natural acknowledgements — not maximal emotion.

## Tomorrow's bake-off (2026-09-25)

**Rule: the live line is not touched.** Everything runs on separate test assistants (Vapi/ElevenLabs/Retell all offer a
"talk to assistant" web button, so most variants need **no phone number**; buy one number only for the finalists).

### Variants, in order (stop early if one clearly wins)
1. **A** — clone Alice in Vapi; voice = ElevenLabs (pick 3 warm female voices; model Flash v2.5 and the newest conversational model). ~30 min.
2. **B** — same clone, voice = Cartesia Sonic-3. ~15 min.
3. **E** — same clone, model = gpt-realtime-2.1-mini (and 2.1) — retest of the earlier failure, with the NH-18-style interruption script. ~30 min.
4. **C** — build the ElevenLabs Agent with our 7 tools as webhooks (same secret header check) on the test tenant; connect one Twilio/SIP test number. ~2–3 h. *Only if A/B don't already satisfy.*
5. **D** — Retell, if time and C didn't win.

### Same scripted calls for every variant (10 calls, ~3 min each)
1. Plain booking: "roof inspection Thursday afternoon", name, number, address.
2. Booking with a name/address the agent must spell back (unusual name).
3. Caller interrupts mid-sentence twice; then a long pause; then "sorry, say that again?".
4. Caller talks fast / mumbles / background noise (phone on speaker).
5. Emergency: "water is coming through my ceiling now" → escalation.
6. Off-topic ask ("what's the weather / stock tips") → polite scope refusal.
7. Reschedule and cancel an existing booking (lookup + cancel tools).
8. After-hours call → pending confirmation path.
9. Spanish caller opens in Spanish (relevant to T-106).
10. Caller asks "am I talking to a robot / is this recorded?" → honest answer + T-102 notice.

### Scorecard (fill one row per variant)
| Variant | Human-ness 1–5 (blind, ≥3 listeners) | Time to first word | Talk-over incidents | Tool success (booking correct in Pipeline) | Spanish OK? | Cost/min (from invoice) | Notes |
|---|---|---|---|---|---|---|---|

**Decision rule:** ship the cheapest variant with human-ness ≥ 4, **zero** talk-over incidents, and 10/10 correct tool results.
If C wins by ≥1 point over the best Vapi variant, plan a migration behind a per-business `voiceProvider` flag
(T-110 follow-up) — never a flag-day cutover.

### What I (Claude) can prepare / do tomorrow
- Create the test assistants via API (we already have `VAPI_API_KEY`; scripts exist: `set-vapi-human-voice.mjs`, `rollback-vapi-voice.mjs`) — with your OK.
- Tune the prompt's *speaking style* for the variants (short turns, acknowledgements, no read-aloud lists) — often worth as much as the voice.
- Wire ElevenLabs Agents' tool webhooks to our `agentTools.ts` if C is reached (small adapter route).
- Pull each variant's call records into the scorecard.

### What I need from you tomorrow
- An **ElevenLabs** account/API key (and a **Retell** account only if we reach D).
- 2–3 people (or you + family) to blind-rate recordings.
- Your OK to buy **one** Twilio (or Vapi) test number for the finalists.
- 90 minutes of uninterrupted call-making.

## Sources (September 2026 searches — verify before relying)
- Retell, "8 Best Voice AI Platforms for 2026" — https://www.retellai.com/blog/best-voice-ai-providers
- Supermia, "Best AI Voice Agents 2026 (1,500 calls)" — https://supermia.ai/blog/ai-voice-agents/
- Cekura, "8 Best TTS APIs for AI Voice Agents in 2026" — https://www.cekura.ai/blogs/best-tts-for-ai-voice-agents
- ElevenLabs Agents changelog / Twilio integration — https://elevenlabs.io/docs/changelog/2026/9/7 · https://elevenlabs.io/agents/integrations/twilio
- ElevenAgents pricing — https://elevenlabs.io/pricing/agents
- Hume, "Introducing EVI 3" — https://www.hume.ai/blog/introducing-evi-3 ; Twilio/phone guide — https://dev.hume.ai/docs/integrations/twilio
- OpenAI Realtime + SIP — https://developers.openai.com/api/docs/guides/realtime-sip
- Gemini Live + Twilio — https://dev.to/googleai/add-telephony-to-a-gemini-live-agent-with-twilio-1elc
- Amazon Nova Sonic — https://www.geekwire.com/2025/amazon-enters-real-time-ai-voice-race-with-nova-sonic-a-unified-voice-model-that-senses-emotion/
- Retell pricing — https://www.cekura.ai/blogs/retell-ai-pricing-per-minute

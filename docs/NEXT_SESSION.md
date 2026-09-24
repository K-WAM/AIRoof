# NEXT_SESSION.md — plan for 2026-09-25

Goal of the session: **pick the phone-AI voice/provider with evidence**, and keep two Codex sessions building in parallel.

## 1. Before you start (10 minutes)

1. Admin -> **Clients** -> "Sync live phone assistants" -> **Preview changes** -> **Apply**. This pushes the recording notice
   (T-102) to the live assistant. Then place one call to the demo line and confirm you hear the notice first.
   (If the panel looks cramped, that is T-114's job — ignore it for now.)
2. Put your ElevenLabs API key in `.env.local` as `ELEVENLABS_API_KEY=...` (never paste it in chat). Do **not** put it in Vercel yet.
3. Start the two Codex sessions from `docs/WORKER_QUEUE.md`:
   - **Codex A** -> prompt **A1** (finish T-111b), later **A2** (T-113)
   - **Deepseek** -> prompt **B1** (T-114; bounded UI work), then stop. **B2** (T-107a, money math) goes to the next free Codex session
   Paste each prompt into its own session; each already has its worktree. When a session reports back, paste the report to Claude
   to review/merge, then give it its next prompt.

## 2. Voice bake-off (the main event) — follow `docs/VOICE-RESEARCH-2026-09-24.md`

- Variants in order: **A** Vapi + ElevenLabs voice, **B** Vapi + Cartesia, **E** gpt-realtime-2.1(-mini) via Vapi, then **C** ElevenLabs
  Agents with the 7 tools (only if A/B do not clearly win), **D** Retell (only if C disappoints).
- **Never touch the live line.** Use separate test assistants; the "talk to assistant" web buttons need no phone number.
- 10 scripted calls per variant, scorecard in the research doc, >= 3 blind listeners, decision rule in the doc.
- Bring: ElevenLabs key (in `.env.local`), 2–3 raters, permission to buy ONE test phone number for finalists, ~90 minutes.
- If ElevenLabs Agents wins: the seam exists (`voiceProvider`), T-111b finishes the webhooks, then T-112 (tools on the agent, number import,
  existing-number forwarding onboarding) and T-106 (bilingual line) become the next prompts.

## 3. Human items still open (see `docs/NEEDS-HUMAN-CHECKLIST.md`)

NH-1 Vapi console audit · NH-3 Resend domain · NH-4 recording wording (counsel) · NH-8 real-device tests · NH-17 `crm.luxordev.com` ·
NH-18 Care Homes/Daycares safety calls · NH-20/21/22 ElevenLabs key/number/privacy · T-081 Stripe key · NH-19 decision on `business.active`.

## 4. Repo state to know

- `main` (pushed, CI green) has T-111a live but dormant (default Vapi). It touches the paths that push greetings and place outbound calls,
  so if anything odd shows up in greeting pushes or callbacks, suspect it first.
- Worktrees (all cut from main, `node_modules` junctioned): `air-wt-elevenlabs-hooks`, `air-wt-request-review`, `air-wt-ux-pass`,
  `air-wt-documents-core`.
- Deepseek is out of credits; its unfinished work is committed as WIP `16f8d5e` on `task/elevenlabs-hooks`.

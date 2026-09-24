# NEXT_SESSION.md — start here (written end of 2026-09-24)

## Where we are in one paragraph
Vapi (+1 754 283 7658) is still the wired demo line. In parallel, **ElevenLabs is wired end-to-end on a separate test business**
(`carlita-elevenlabs-test`, saved, Active, provider = ElevenLabs): agent `agent_0101m3a5z9qxenybnpjsragg7dvt` ("Alice — Roofing (voice test)"),
Twilio number **+1 689 204 2643** (`phnum_0801m3aknbref2w9tbhqc6ad3xzb`, Twilio is on TRIAL — callers hear a trial message until you Upgrade),
7 booking tools attached, per-call overrides ON, initiation webhook set, tool secret + API key in Vercel prod + `.env.local`. **Not yet done:** the
post-call webhook (transcripts back into the app) and the first real test call. Direction (owner): move from Vapi to ElevenLabs tenant by tenant (T-117).

## First 15 minutes
0. **DONE 2026-09-24 (after this doc was first written): the post-call webhook exists, the secret is in Vercel prod, and prod was redeployed — skip step 1. The FIRST REAL TEST CALL WAS DONE (2026-09-24): initiation, checkAvailability, bookAppointment and post-call all returned 200, appointment ID issued, ~$0.16 for 2 min. Next: verify it shows in the Pipeline (Admin -> Clients -> Preview `carlita-elevenlabs-test`), then Twilio Upgrade and the T-118 prompt fixes (AI read the ID letter-by-letter; ~7 s dead air before tools).**
1. ~~Post-call webhook (owner, click-by-click was given in chat):~~ ElevenLabs -> create webhook `https://ai-roof.vercel.app/api/webhooks/elevenlabs/post-call`
   (HMAC; transcript + call-failure events) -> copy the signing secret ONCE -> put it in `.env.local` as `ELEVENLABS_WEBHOOK_SECRET=` -> tell Claude
   "webhook secret saved" -> Claude pushes it to Vercel (`vercel env add ... production --sensitive`, from the file, never printed) and redeploys.
2. **First test call** to +1 689 204 2643 (expect the Twilio trial message, then "Roofus" — the app-generated persona for the roofing template, NOT the hand-written
   Alice prompt: with overrides ON the app's prompt/greeting win). Claude then reads the conversation via the ElevenLabs MCP and checks Pipeline / Calls.
3. Compare feel: app-generated prompt vs the dashboard Alice prompt (T-118 ports the human style + Spanish invitation into the app prompt).

## Tooling facts (do not re-derive)
- **ElevenLabs MCP** is registered at user scope with the **US** URL: `claude mcp add --scope user --transport http elevenlabs https://api.us.elevenlabs.io/v1/mcp`
  (the global URL fails the OAuth resource check for a US-region account). Re-auth via `/mcp` if it drops. Tools: `mcp__elevenlabs__agents_*` (deferred; load with ToolSearch).
- **Key/secrets:** `.env.local` (gitignored) holds `ELEVENLABS_API_KEY`, `ELEVENLABS_TOOL_SECRET`, `NEXT_PUBLIC_APP_URL`; Vercel prod has the first two (sensitive). The key
  is restricted (ElevenAgents write, Voices read, Models/User read, 5000-credit cap; NO Webhooks permission — that is why the post-call webhook is a dashboard step).
- **Setup script:** `node scripts/setup-elevenlabs-agent.mjs --apply --agent-id <id>` (dry run without `--apply`) — already applied to Alice.
- **Vercel CLI works** (`vercel env ls|add`, `vercel logs --environment production --since 30m --level error --expand`) — use logs to diagnose 500s.
- Removing a worktree: UNLINK the `node_modules` junction first (`[System.IO.Directory]::Delete(path,$false)`), then `git worktree remove`.
- Lint ignores `.kilo/**` (another tool parks repo copies there).

## Build queue (see docs/WORKER_QUEUE.md for paste-ready prompts)
| Item | Who / model | State |
|---|---|---|
| T-113 request review + decline | Codex A, Terra medium | mostly built on `task/request-review` (worktree `air-wt-request-review`); needs route-level + UI tests, gates, log — continuation prompt in WORKER_QUEUE "A2b" |
| T-107a documents (invoice/quote, hide labor, logo everywhere) | next free Codex, Sol medium | queued; worktree `air-wt-documents-core`; prompt B2 |
| T-119 declutter admin config form | Deepseek V4 Flash Think High | logged, no worktree/prompt yet |
| T-118 human style + Spanish invite in app prompt | Codex Terra medium | logged |
| T-115 widget on /try | Codex Terra medium | logged (touches CSP), after demo agent choice |
| T-107b report, T-109 email intake, T-106 bilingual line, T-112 rest | later | in TODO.md |
| T-117 Vapi -> ElevenLabs migration P1..P4 | Claude + owner | P0 done; P1 = parity calls |

## Owner's list (docs/NEEDS-HUMAN-CHECKLIST.md)
NH-23 post-call webhook + secret (above) · NH-21 Twilio: click **Upgrade** before any prospect demo; consider a 561 (Boca) number after upgrading · NH-22 ElevenLabs retention/recording
policy (currently unlimited retention, recording on) · NH-4 recording wording with counsel · NH-1 Vapi audit · NH-3 Resend domain · NH-8 real-device tests ·
NH-17 crm domain · NH-18 Care Homes/Daycares safety calls · press **Apply** on Admin -> Clients -> Sync live phone assistants · escalation phone + notification email on the test business.

## Repo state
`main` is pushed and CI green as of the last commit of the session. Worktrees: `air-wt-request-review`, `air-wt-documents-core` (+ a stray `.kilo` one that is not ours).
Production health: `elevenlabs: configured`, `vapi: configured`, `stripe: not_configured`.

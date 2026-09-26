# AI & paid providers — what bills what, and where to recharge (DRAFT)

> **Status: DRAFT — for the owner to complete.** Env var **names only** below; never put a value in this
> file. Every dashboard URL is marked **verify** — the owner should confirm the exact billing page before
> relying on it. Account owners are left as **"owner to fill"**.
>
> Everything in the "What it does in the app" column was read from the code on 2026-09-26
> (`src/lib/ai/registry.ts`, `src/lib/config/env.ts`, `.env.example`, `src/lib/comms/send.ts`,
> `src/app/api/webhooks/elevenlabs/**`, `src/lib/voice/elevenlabs/**`). Provider pricing changes; this
> file does not quote prices on purpose.

## Providers

| Service | What it does in the app | Env var names (names only) | What breaks when the balance runs out | Where to recharge (**verify**) | Account owner |
|---|---|---|---|---|---|
| **OpenAI** | Text model `gpt-4o` for `parse-field-update` (turns a field note into materials/labor/issues) and `gpt-4o-mini` for `agent-respond`; audio model `whisper-1` for `transcribe` (field-note voice and call audio). Defaults in `src/lib/ai/registry.ts:60-67`. | `OPENAI_API_KEY`, `OPENAI_MODEL` | Field notes stop parsing (the "parse failed" state); field voice notes and Whisper transcription fail. The phone agent itself is ElevenLabs, not OpenAI. | https://platform.openai.com/account/billing (**verify**) | owner to fill |
| **DeepSeek** | `deepseek-chat` for `summarize`, `classify` (call-outcome classification that feeds leads) and `faq-suggest`. Defaults in `src/lib/ai/registry.ts:61-64`. | `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` | Classification fails. Today that failure is **silent**, and the end-of-call lead safety net is skipped with it; there is no fallback yet — E2 (`docs/DEMO-FEEDBACK-PLAN.md`) adds a one-shot OpenAI `gpt-4o-mini` fallback. | https://platform.deepseek.com/top_up (**verify**) | owner to fill |
| **ElevenLabs** | The phone agent: its LLM, voice/TTS, the 7 webhook tools, the conversation-initiation override and the post-call webhook. Code: `src/lib/voice/elevenlabs/**`, `src/app/api/webhooks/elevenlabs/**`, `scripts/setup-elevenlabs-agent.mjs`. | `ELEVENLABS_API_KEY`, `ELEVENLABS_WEBHOOK_SECRET`, `ELEVENLABS_TOOL_SECRET` | The demo/live line stops answering or errors; webhook tools and post-call writes fail. | https://elevenlabs.io/app/subscription (**verify**) | owner to fill |
| **Twilio** | Owns the phone number behind the ElevenLabs line. This repo makes **no direct Twilio API call** — the number is managed in the Twilio console / ElevenLabs' Twilio integration. The old `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` app vars were removed in T-051. | *none in this repo* | A trial account plays a trial message before every call and can only call verified numbers (NH-21: upgrade before any prospect calls the line). Later, an unpaid account is suspended. | https://console.twilio.com (**verify**) | owner to fill |
| **Resend** | Transactional email: appointment confirmations, request declines, and report/quote/invoice sends. `src/lib/comms/send.ts`, `RESEND_FROM` is the verified transactional sender. | `RESEND_API_KEY`, `RESEND_FROM` | Emails are not delivered. Routes must check the result and **not** mark a document "sent" when delivery fails (`status !== "delivered"` => 502). | https://resend.com/settings/billing (**verify**) | owner to fill |
| **Vapi** | **Retired from demos** (owner decision 2026-09-25). The legacy inbound/outbound webhook path and client still exist in code but are not the demo line; the live assistant still depends on the existing tool contracts, so nothing was deleted. | `VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET` | The legacy path fails (not used by demos). **Owner action: confirm whether the Vapi account is still active and still billing, and cancel if dormant.** | https://dashboard.vapi.ai (**verify**) | owner to fill |
| **Vercel** | Hosting, builds/deploys, serverless functions and the cron routes (`src/app/api/cron/**`). No provider key of its own in the app. | *none in this repo* (platform configuration; optional `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`) | Builds/deploys are blocked or functions are disabled when plan limits are hit. Hobby forbids commercial use (NH-27). | https://vercel.com/dashboard/usage (**verify**) | owner to fill |
| **Firebase** | Authentication (Firebase Auth) and the Firestore database (all business data). `FIREBASE_SERVICE_ACCOUNT_JSON` is the server Admin credential; the `NEXT_PUBLIC_FIREBASE_*` vars are the browser config. | `FIREBASE_SERVICE_ACCOUNT_JSON`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | Auth and all reads/writes fail. Demos run on the Spark (free) plan by owner decision; if the Spark quota is exceeded, data stops loading. On Blaze, an expired card suspends the project. | https://console.firebase.google.com (**verify**) | owner to fill |

## What to check first when something stops

1. **Ask `/api/health`.** It reports each capability's `configured`/`not_configured` status, including
   `elevenlabs` (see `src/lib/config/env.ts`). It does **not** see a zero balance, only a missing key.
2. **"The phone doesn't answer / errors."** ElevenLabs (and, upstream, the Twilio number). Check the
   ElevenLabs workspace subscription and the Twilio account status.
3. **"Field notes stopped parsing / the mic does nothing."** OpenAI — both the text parse
   (`gpt-4o`) and Whisper (`whisper-1`) bill to the same OpenAI account.
4. **"New calls stop producing leads / summaries are blank."** DeepSeek. Look for the silent
   classification failure described above; check the DeepSeek balance first.
5. **"Customers didn't get the email."** Resend — balance, verified sender/domain, and the `RESEND_FROM`
   value. Confirm the send route logged a failure rather than claiming "sent".
6. **"Nothing loads at all / sign-in fails."** Firebase — Auth and Firestore (project health and quota).
7. **"A change didn't go live."** Vercel — deploy status and plan limits.

## Related

- Setup and env var meanings: `.env.example` and `docs/ELEVENLABS-SETUP.md`.
- Open owner actions live in `TODO.md` under NEEDS-HUMAN (e.g. NH-21 Twilio upgrade, NH-24 rotate the
  Firebase service-account key, NH-27 Vercel plan).

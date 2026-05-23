# AI Receptionist Platform — Handoff

Date: 2026-05-22

## Current Status: Vapi-Powered, Working End-to-End

The platform migrated from a custom Twilio webhook pipeline to **Vapi** (managed voice AI). The old Twilio routes are deleted. Alice (formerly Roofus) answers calls on Vapi, conducts multi-turn conversations, fires tools (bookAppointment / createLead), writes to Firestore, and sends Resend emails — all confirmed with a live call.

**Demo number**: +1 (754) 283-7658 (Vapi number)

---

## What Was Built This Session

### Migration: Twilio custom pipeline → Vapi
- **Deleted**: `src/app/api/webhooks/twilio/incoming/route.ts`, `transcribe/route.ts`, `src/lib/twilio/voice.ts`
- **Added**: `src/app/api/webhooks/vapi/route.ts` — single webhook handles all Vapi message types
- **Added**: `src/lib/vapi/types.ts`, `src/lib/vapi/verify.ts`, `src/lib/vapi/businessLookup.ts`
- Vapi stack: Deepgram nova-3 (STT) + Claude Haiku 4.5 (LLM) + ElevenLabs (TTS) ≈ ~1826ms avg turn latency
- Conversation memory: `openaiClient.ts` now accepts `history?: ConversationTurn[]`, passes prior turns to the model

### Agent setup (done in Vapi UI, not in code)
- **Assistant ID**: `9267a84a-0f4f-416b-a328-1dc539f5265e`
- **Agent name**: Alice (renamed from Roofus)
- **Webhook URL**: `https://ai-roof.vercel.app/api/webhooks/vapi` (set in Vapi assistant → Advanced → Server URL)
- **4 tools in Vapi**: bookAppointment, createLead, escalateCall, checkAvailability — each points to the same webhook URL

### Demo customizer
- `/admin/demo` page — enter prospect company + email → Alice greets them by their company name in one click
- `POST /api/admin/demo-customize` — updates Firestore + PATCHes Vapi assistant firstMessage via `VAPI_API_KEY`
- `DELETE /api/admin/demo-customize` — resets to "Apex Roofing South Florida" defaults
- CLI equivalent: `node scripts/demo-customize.mjs <email> "<Company Name>"` / `--reset`

### Confirmed working (live call)
- Multi-turn conversation holds context across turns
- Caller says "book an appointment" → Alice fires bookAppointment tool → Firestore appointment doc written → Resend email arrives in inbox
- Demo customizer: company name appears in greeting after Apply

---

## Pending Items

| Item | Status | Notes |
|------|--------|-------|
| VAPI_WEBHOOK_SECRET mismatch | Bypassed with `VAPI_AUTH_BYPASS=true` in Vercel | Not urgent for demo. To fix properly: delete secret in Vercel, generate new one, set in Vercel, then carefully paste same value in Vapi UI (assistant → Advanced + each tool server) |
| Voice upgrade | User task in Vapi UI | Switch Alice to `eleven_multilingual_v2` + Rachel voice ID `21m00Tcm4TlvDq8ikWAM` for hyper-realistic demo voice |
| Superadmin onboarding wizard | Not built | Auto-create Vapi assistant + phone number + 4 tools for each new business client; currently manual |
| Google Calendar integration | Not built | Post-MVP; requires per-business OAuth |

---

## Architecture (Current)

```
Inbound call → Vapi phone number → Vapi assistant (Alice, 9267a84a)
  → Deepgram nova-3 STT (~100ms)
  → Claude Haiku 4.5 via Vapi LLM config
  → ElevenLabs TTS (~612ms)
  → Vapi posts webhook to: https://ai-roof.vercel.app/api/webhooks/vapi

Vapi webhook types handled:
  function-call   → routes to agentTools.ts (bookAppointment, createLead, escalateCall, checkAvailability)
  status-update   → creates call record in Firestore calls/{callId}
  end-of-call-report → saves transcript, recording URL, summary to Firestore
```

Business lookup: `src/lib/vapi/businessLookup.ts` maps `vapiAssistantId → businessId` via Firestore query on the `businesses` collection.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/app/api/webhooks/vapi/route.ts` | Single Vapi webhook — handles all message types |
| `src/lib/vapi/types.ts` | Vapi payload types |
| `src/lib/vapi/verify.ts` | Webhook secret verification (bypass active) |
| `src/lib/vapi/businessLookup.ts` | Maps vapiAssistantId → businessId |
| `src/app/admin/demo/page.tsx` | Demo customizer UI |
| `src/app/api/admin/demo-customize/route.ts` | Demo POST/DELETE endpoint |
| `scripts/demo-customize.mjs` | CLI demo customizer |
| `src/lib/tools/agentTools.ts` | bookAppointment, createLead, escalateCall (Resend wired) |
| `src/lib/ai/openaiClient.ts` | OpenAI wrapper (accepts history: ConversationTurn[]) |

---

## How to Run a Demo

1. Go to `/admin/demo`
2. Enter prospect company name + email → click **Apply demo config**
3. Have the prospect call **+1 (754) 283-7658**
4. Alice greets them as their company ("Thanks for calling [Company Name], this is Alice...")
5. They can book an appointment — email arrives in prospect inbox in real time
6. Open `/company/dashboard` (logged in as that business) to show the captured lead
7. Click **Reset to defaults** when done

---

## Next Engineering Actions

1. **Superadmin onboarding wizard** — `/admin/onboarding` auto-creates Vapi assistant + phone number + 4 tools via Vapi API; writes `businesses/` and `businessPhoneNumbers/` docs to Firestore
2. **Fix VAPI_WEBHOOK_SECRET** — remove bypass, generate new secret, set in both Vercel and Vapi UI
3. **Phase 3** — after-hours logic, call outcome tagging (DeepSeek), FAQ suggestions cron

---

## Environment Variables (Vercel, Production)

| Var | Purpose |
|-----|---------|
| `VAPI_API_KEY` | Vapi REST API for demo-customize |
| `VAPI_AUTH_BYPASS` | Set to `true` — bypasses webhook signature check |
| `VAPI_WEBHOOK_SECRET` | Currently mismatched; bypass active |
| `OPENAI_API_KEY` | LLM responses |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firestore Admin SDK |
| `RESEND_API_KEY` | Email notifications |
| `RESEND_FROM` | Needs a verified Resend sending domain |

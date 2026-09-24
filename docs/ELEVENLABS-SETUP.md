# ElevenLabs Setup — click-by-click (T-111b)

What the **script** does vs. what needs the **dashboard**. The provisioning script
(`node scripts/setup-elevenlabs-agent.mjs --apply`) creates the 7 webhook tools, the
`LUXOR_TOOL_SECRET` workspace secret, and the test agent. Everything below is
dashboard-only (the ElevenLabs UI has no public API for workspace webhooks).

Prerequisites — three values must exist in `.env.local` (and later in Vercel,
Production, type `Secret`):

| Variable | Value |
|---|---|
| `ELEVENLABS_API_KEY` | your ElevenLabs API key (never paste it in chat) |
| `ELEVENLABS_WEBHOOK_SECRET` | a random 40+ char string (e.g. `openssl rand -hex 32`) |
| `ELEVENLABS_TOOL_SECRET` | a DIFFERENT random 40+ char string |

Generate the two secrets once and keep them — they are pasted into BOTH Vercel and
ElevenLabs, and you can't read them back out of either.

---

## 1. API key

1. Sign in at https://elevenlabs.io → your profile (bottom-left avatar) → **API Keys**.
2. If you don't already have a key, **Create API key**, copy it, and put it in
   `.env.local` as `ELEVENLABS_API_KEY`.

## 2. Run the provisioning script (tools + secret + test agent)

```bash
# Dry run first (default — makes no writes):
node scripts/setup-elevenlabs-agent.mjs

# Then apply:
node scripts/setup-elevenlabs-agent.mjs --apply
```

The script prints the ids of the 7 tools (`bookAppointment`, `createLead`,
`checkAvailability`, `escalateCall`, `lookupAppointment`, `cancelAppointment`,
`getCurrentDate`), the workspace secret `LUXOR_TOOL_SECRET`, and the agent
`Luxor AI Receptionist (test)`. It is idempotent by name — re-running reuses
existing resources and never duplicates.

> Note: the script creates the workspace secret from `ELEVENLABS_TOOL_SECRET`.
> If you change that value later, delete the old `LUXOR_TOOL_SECRET` entry in
> the secrets manager and re-run the script (secret values can't be read back,
> so the script can't detect a stale value).

## 3. Workspace settings → conversation initiation webhook

This is what makes inbound calls personalizable per tenant. Go to
**ElevenAgents → Settings** (workspace settings, https://elevenlabs.io/app/agents/settings):

1. Find the **conversation initiation webhook** section (the settings page that
   shows "Configure the webhook URL and add any secrets needed for
   authentication").
2. **Webhook URL**: `https://<your-domain>/api/webhooks/elevenlabs/initiation`
   (e.g. `https://ai-roof.vercel.app/api/webhooks/elevenlabs/initiation`).
3. Add the `LUXOR_TOOL_SECRET` workspace secret to the webhook's headers, sent
   as the header `x-luxor-tool-secret`. (If the UI asks you to "modify which
   secrets are sent in the headers", pick `LUXOR_TOOL_SECRET` and set the header
   name exactly to `x-luxor-tool-secret`.)
4. Save. Expected value of the secret = your `ELEVENLABS_TOOL_SECRET` — the same
   value Vercel has.

> Fail-closed: a wrong/missing header value makes the initiation route return
> 401, and the call still answers on the agent's dashboard prompt (safe, but not
> per-tenant). Vercel logs will show `ElevenLabs webhook auth mismatch`.

## 4. Workspace webhooks → post-call webhook

Go to **ElevenAgents → Settings → Webhooks** (workspace webhooks):

1. **Create webhook**.
2. **URL**: `https://<your-domain>/api/webhooks/elevenlabs/post-call`.
3. **Signing secret**: paste `ELEVENLABS_WEBHOOK_SECRET` (the same value as
   Vercel). Keep the generated secret somewhere safe — the dashboard shows it
   only once.
4. **Events**: enable at least `post_call_transcription` and
   `call_initiation_failure`. Leave **"Send audio data"** OFF for now — our
   endpoint deliberately does not store audio yet (logged only, follow-up).
5. Save, and make sure the webhook applies to all agents (workspace level).

The endpoint verifies the `ElevenLabs-Signature` HMAC over the raw body with a
30-minute timestamp tolerance, dedups retries in Firestore, and writes the same
`calls` document (transcript, summary, outcome) the Vapi path writes.

## 5. Agent → Security tab (per-agent enablement)

Open the agent the script created (`Luxor AI Receptionist (test)`) or any
production agent you'll attach to a tenant:

1. Go to **Agents → <agent> → Security** tab.
2. Enable **"Fetch conversation initiation data"** for inbound Twilio calls
   (the toggle the docs call "Enable fetching conversation initiation data").
3. Under **overridable fields**, allow overriding:
   - System prompt (`agent.prompt.prompt`)
   - First message (`agent.first_message`)
   - Language (`agent.language`)
   - TTS voice (`tts.voice_id`)
   (The script sets these same flags for the test agent it creates via
   `platform_settings.overrides` — do it by hand for agents created in the UI.)

## 6. Tools (if the script was not used)

If you ever create the tools by hand instead of running the script, each of the
7 tools is a **Webhook tool** with:

- **Method** `POST`
- **URL** `https://<your-domain>/api/webhooks/elevenlabs/tools/<toolName>`
- **Header** `x-luxor-tool-secret` = secret type → workspace secret
  `LUXOR_TOOL_SECRET`
- **Header** `x-luxor-conversation-id` = dynamic variable →
  `{{system__conversation_id}}`
- Parameter schemas exactly as in
  `src/lib/voice/elevenlabs/toolSchemas.json`. **Never add** `businessId`,
  `callId`, or `verifiedCallerPhone` parameters — the endpoint resolves all of
  them server-side from the conversation record and ignores anything the model
  supplies.

## 7. Phone number (deferred — T-112)

Importing the Twilio number into ElevenAgents and attaching the agent is a
T-112 follow-up (after the bake-off). Until then, outbound calls and the live
line stay on Vapi; nothing here affects them.

## 8. Verify

1. `curl -X POST https://<your-domain>/api/webhooks/elevenlabs/initiation -H "x-luxor-tool-secret: wrong"` → **401** (fail closed).
2. In the ElevenLabs dashboard, **Test** the test agent → it should answer with the generic test greeting.
3. After a test call completes, check **Company → Calls** in the app — the ElevenLabs call should appear with its transcript and outcome, same as a Vapi call.
4. Check Vercel logs for `ElevenLabs webhook auth mismatch` (means the tool/initiation secret is out of sync between Vercel and ElevenLabs).

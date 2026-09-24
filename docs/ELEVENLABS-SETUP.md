# ElevenLabs test agent setup (T-111b)

This starts with an empty ElevenLabs Creator account. Keep the production Vapi number on Vapi during the T-110 bake-off. An ElevenLabs phone number and live call are T-112 follow-up work. Use a public HTTPS app URL for the webhook fields below.

The UI path and labels below were checked against the [agent quickstart](https://elevenlabs.io/docs/eleven-agents/quickstart), [webhook tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools), [conversation initiation](https://elevenlabs.io/docs/eleven-agents/customization/personalization), [Twilio personalization](https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/customising-calls), [override settings](https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides), and [post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks). ElevenLabs changes its UI; the exact button labels for creating a webhook and adding a workspace secret are **not shown in text in those docs**. No dashboard was accessed and no live ElevenLabs API call was made while writing this guide.

## 1. Create a test agent and choose a voice

1. Sign in to ElevenLabs and open **ElevenAgents**. Create a new agent, name it `Luxor AI Receptionist (test)`, and select **Blank template**. The quickstart calls this a new assistant; the exact creation button wording is not verified in current docs.
2. In the **Agent** tab, set a harmless test **First message** and **System prompt**. The live tenant text comes from the initiation webhook only on supported phone calls. Dashboard Preview does **not** invoke that webhook.
3. Open the **Voice** tab, choose a voice from the library, and save. Use **Test AI agent** to hear the fallback voice. A tenant's T-103 voice override may replace it per call.
4. Copy the agent ID from its dashboard URL or settings. Do not attach a production number.

## 2. Create the API key and secrets

1. Open **Developers → API Keys**. Create a key with access to Agents, Tools, and workspace Secrets. Copy it once into your local `ELEVENLABS_API_KEY` environment variable or ignored `.env.local`. The [API-key help page](https://elevenlabs.io/docs/help-center/technical/how-do-i-authorize-myself-using-an-api-key) verifies **Developers** and **API Keys**; exact permission-toggle labels were not verified.
2. Generate a random tool secret locally (for example, `openssl rand -hex 32`). Store it as `ELEVENLABS_TOOL_SECRET` in `.env.local` and in your server's secret environment configuration. Never commit or paste its value in chat.
3. In ElevenAgents workspace **Settings**, create a workspace secret named `LUXOR_TOOL_SECRET` with that same value. This is used for `x-luxor-tool-secret` on all seven tools and the initiation webhook. If using the script below, it creates/reuses this workspace secret for you. The [Secrets API](https://elevenlabs.io/docs/eleven-agents/api-reference/workspace/secrets/create) verifies the `name`/`value` fields; the exact dashboard button label was not verified.
4. Set `NEXT_PUBLIC_APP_URL` to your **public HTTPS** app origin, without a trailing slash. The script requires this value and has no production-domain default.

`ELEVENLABS_WEBHOOK_SECRET` is obtained **later**, when ElevenLabs creates the post-call webhook. It is different from the tool secret.

## 3. Add the seven webhook tools

**Script path:** from the repository root, with `ELEVENLABS_API_KEY`, `ELEVENLABS_TOOL_SECRET`, and `NEXT_PUBLIC_APP_URL` set:

```text
node scripts/setup-elevenlabs-agent.mjs          # dry run: no network or writes
node scripts/setup-elevenlabs-agent.mjs --apply  # creates missing resources
```

The script reads `src/lib/voice/elevenlabs/toolSchemas.json`, creates or reuses the workspace secret and seven tools **by name**, and creates the test agent only if that name does not already exist. It never prints secret values. If you created the agent in step 1, the script reuses it; **attach the seven printed tool IDs to that agent in its Tools section**. The script does not modify an existing agent's prompt, voice, or tool list. On a fresh script-created agent, open its **Voice** tab and choose a voice before testing. If a previous run created `LUXOR_TOOL_SECRET` with a different value, update it in the dashboard or delete/recreate it before using the tools; the script cannot read secret values back.

**Dashboard path:** in the agent's **Tools** section, add seven **Webhook** tools and attach each one to the test agent. Use the exact names `bookAppointment`, `checkAvailability`, `createLead`, `escalateCall`, `lookupAppointment`, `cancelAppointment`, and `getCurrentDate`. For each tool set:

- **Method:** `POST`.
- **URL:** `https://<your-domain>/api/webhooks/elevenlabs/tools/<exactToolName>`.
- **Header** `x-luxor-tool-secret`: choose the workspace secret `LUXOR_TOOL_SECRET` (Secret header type).
- **Header** `x-luxor-conversation-id`: choose a Dynamic Variable header with `system__conversation_id` (shown in templates as `{{system__conversation_id}}`).
- **Body parameters:** copy the corresponding `parameters` object in `src/lib/voice/elevenlabs/toolSchemas.json`. Do not add `businessId`, `callId`, `callerPhone`, or `verifiedCallerPhone`; identity comes from the stored conversation record.

The [webhook-tool guide](https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools) verifies the Webhook tool type, Name, Description, method, URL, headers, Secret selection, and body parameters. The [dynamic-variable guide](https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables) verifies `system__conversation_id` and header use. The exact agent Tools-section button wording was not verified.

## 4. Enable agent Security settings

Open the test agent's **Security** tab. Enable **Fetch initiation client data from a webhook** and these override fields: **System prompt**, **First message**, **Language**, and **Voice ID**. The route returns `conversation_config_override.agent.prompt.prompt`, `agent.first_message`, `agent.language`, and sometimes `tts.voice_id`; each must be allowed. Overrides are optional per call when the tenant has no value. Save the agent. These field names are verified in the [override guide](https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides); the initiation toggle wording is verified in the [personalization guide](https://elevenlabs.io/docs/eleven-agents/customization/personalization).

## 5. Configure the conversation initiation webhook

In ElevenAgents workspace **Settings**, find **Conversation initiation webhook** (also called **Conversation Initiation Client Data Webhook** in the docs). Set:

- **URL:** `https://<your-domain>/api/webhooks/elevenlabs/initiation`.
- **Header name:** `x-luxor-tool-secret`.
- **Header value:** select workspace secret `LUXOR_TOOL_SECRET`.

Save, then check the agent Security toggle from step 4. ElevenLabs sends `caller_id`, `called_number`, `agent_id`, `call_sid`, and `conversation_id` for inbound Twilio calls; our endpoint records the conversation before tools run. An invalid secret gets `401`. **A failed or timed-out initiation webhook can prevent a conversation from starting** according to the [personalization guide](https://elevenlabs.io/docs/eleven-agents/customization/personalization), so verify this on a test number before assigning a real line. Dashboard Preview cannot test this webhook.

## 6. Configure post-call delivery and its signing secret

In ElevenAgents workspace **Settings**, find **Post-call webhooks**. The [post-call guide](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks) verifies this section and the three event types; the [environment-variable guide](https://elevenlabs.io/docs/eleven-agents/integrate/environment-variables) also refers to **Developers → Webhooks** for workspace webhook URLs. The exact navigation label in the owner's dashboard could not be verified.

1. Create a webhook with URL `https://<your-domain>/api/webhooks/elevenlabs/post-call`.
2. Enable `post_call_transcription` and `call_initiation_failure` delivery. Leave `post_call_audio` off for now; audio storage is T-112 follow-up work.
3. Copy the **generated signing secret** when shown and set it as `ELEVENLABS_WEBHOOK_SECRET` in the server's secret environment configuration. ElevenLabs signs the raw body in `ElevenLabs-Signature`; this secret must differ from `ELEVENLABS_TOOL_SECRET`.
4. Save and ensure the webhook is enabled for the test agent or workspace. The exact event checkbox and save-button labels were not verified from the text docs.

The endpoint verifies the HMAC and timestamp, then applies a Firestore replay guard before writing the same call-document fields available from Vapi. `post_call_audio` remains a documented follow-up and is not stored.

## 7. Connect a test number and verify

Number import/assignment and the T-110 scripted call bake-off are T-112 follow-ups. Until a test number is connected, only the dashboard agent voice/tools can be previewed; **Preview does not exercise the initiation webhook**. Before the first test phone call, set the tenant's `elevenlabs.agentId` and `elevenlabs.phoneNumber` to the values ElevenLabs will send, configure the server secrets, and check the Firestore TTL policy for `elevenlabsConversations.expiresAt`. The field is stored as a Firestore Timestamp; the TTL policy itself is a console operation and was not created by this code change.

For a test call, verify the greeting includes the recording notice, all seven tools use the stored tenant and caller number, and the post-call transcript/outcome appears in **Company → Calls**. Never place the production number on this test agent before the owner selects a provider.

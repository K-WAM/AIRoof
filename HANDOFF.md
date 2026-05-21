# Roofus Call Failure Handoff

Date: 2026-05-21

## Current Issue

Inbound calls to the Roofus/Apex Roofing Twilio number still say: "sorry, an application error has occurred, goodbye."

The first suspected issue was an invalid Twilio voice value. That was real but not the final blocker. The current root cause from Twilio Monitor is invalid XML in the returned TwiML.

## Evidence

- Vercel production logs show Twilio successfully reaches `POST /api/webhooks/twilio/incoming` and receives HTTP `200`.
- Latest Vercel log seen: request timestamp `1779393947077`, deployment `dpl_BbyrV2327dfhErPPZCbBiqHohzPF`, path `/api/webhooks/twilio/incoming`, status `200`.
- Twilio Monitor alerts show error `12100` at `2026-05-21T20:05:49Z` and `2026-05-21T19:50:36Z`.
- Twilio alert text: `Document parse failure`, parser message: `The reference to entity "callId" must end with the ';' delimiter.`
- Cause: the generated TwiML used a raw ampersand in the Gather action URL:
  `/api/webhooks/twilio/transcribe?businessId=demo-roofing&callId=...`
- XML attributes require `&` to be escaped as `&amp;`.

## Changes Made In This Workspace

- Patched `src/app/api/webhooks/twilio/incoming/route.ts` and `src/app/api/webhooks/twilio/transcribe/route.ts` so `<Gather action="">` uses `escapeXml(transcribeUrl)`.
- Added `src/lib/twilio/voice.ts` to map app/OpenAI voice names to Twilio-safe `<Say>` voices.
- Updated both Twilio webhook routes to call `getTwilioSayVoice(...)`.
- Updated seed/admin defaults away from invalid OpenAI voice values (`alloy`, `verse`, `sage`) toward Twilio-safe values.
- Live Firestore data was updated directly:
  `businesses/demo-roofing.agentVoice: alloy -> alice`

## Verification Already Run

- `npx tsc --noEmit --incremental false` passed.
- `npm run build` passed after the XML escaping fix.
- Commit `accf0a90555771c5f1952d78aab871b92db21913` was pushed to `main`.
- Vercel production deployment `dpl_3dgShQXHUB33cURupqTGG7SFrx8n` reached `READY` and is aliased to `ai-roof.vercel.app`.

## Important Next Action

Make another inbound test call.

After the test call:

- Check `vercel logs --environment production --since 15m --limit 100 --no-follow --json`.
- Query Twilio Monitor alerts again. If `12100` is gone but the call still fails, inspect the next Twilio error code.
- Do not continue debugging the old voice issue unless Twilio reports a voice-specific error; the latest confirmed blocker is XML parse failure from the raw `&callId`.

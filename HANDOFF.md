# Roofus Call Failure Handoff

Date: 2026-05-21

## Current Status

All known call blockers are fixed and deployed. The next step is a live test call to +16892042643.

## What Was Fixed This Session

### Fix 1 — Relative URL in `<Gather action="">` (was causing 100% call failure)
Both `incoming/route.ts` and `transcribe/route.ts` were generating a relative URL like
`/api/webhooks/twilio/transcribe?...` in the TwiML `<Gather action="">` attribute.
Twilio requires absolute URLs. Fixed to `https://${host}/api/webhooks/twilio/transcribe?...`
using the request's `host` header.

### Fix 2 — Missing `businessPhoneNumbers` Firestore document (caused immediate hangup)
`mapPhoneToBusinessId()` queries `businessPhoneNumbers` where `normalizedPhoneNumber == twilioTo`
and `active == true`. The seed script never created this doc, so every call got
"Sorry, we could not process your call." Fixed seed script + re-ran it live.
Firestore now has `businessPhoneNumbers/demo-roofing-main` with `active: true`.

### Fix 3 — Signature validation included query string (caused 403 on every transcribe request)
`transcribe/route.ts` built the validation URL as `pathname + search`. Twilio signs the base
URL + POST body only — the `?businessId=...&callId=...` we added are not part of Twilio's
signature. Changed to `pathname` only.

### Fix 4 — No root page.tsx (caused Vercel 404 on every visit)
Added `src/app/page.tsx` that server-redirects to `/login`.

### Fix 5 — Login page: email/password added
Login page now supports Google OAuth and email/password sign-in + account creation.

### Fix 6 — Superadmin provisioned
`businessUsers/GNIGxFp0utMtaFa8xpMaNB5RAsj2` written with `superadmin: true, role: "superadmin"`
for `connect@luxordev.com`. Signing in with that account now grants access to `/admin`.

## Verified Firestore State

- `businessUsers/GNIGxFp0utMtaFa8xpMaNB5RAsj2` → superadmin: true ✓
- `businessPhoneNumbers/demo-roofing-main` → active: true, normalizedPhoneNumber: +16892042643 ✓
- `businesses/demo-roofing` → agentVoice: alice, active: true ✓

## Deployed Commits (on main, live on Vercel)

- `ebdf2cd` — Fix 3 Twilio call blockers: absolute URLs, phone mapping, sig validation
- `5614674` — Add root page redirect to /login
- `3e3f625` — Add email/password sign-in and superadmin setup script

## Next Action

1. **Make a test call to +16892042643** — should hear: "Thanks for calling Apex Roofing South Florida, this is Roofus. How can I help?"
2. If call fails, check Vercel logs for the incoming webhook. The most likely remaining issue would be Twilio console webhook URL not yet set.
3. **Confirm Twilio webhook URL** is set to `https://ai-roof.vercel.app/api/webhooks/twilio/incoming` (POST) in the Twilio console for the +16892042643 number.

## Remaining Gaps After Call Works

- **Conversation memory**: Roofus sees only the current turn — fix is to load `call.messages[]` from Firestore before calling OpenAI in `transcribe/route.ts`
- **Tool use during calls**: Roofus never calls `bookAppointment()` or `createLead()` mid-call

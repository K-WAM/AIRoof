# Offline demo-path smoke report

`src/e2e/demo-path.test.ts` calls route handlers with real `NextRequest` objects and one shared `makeFakeDb()` store. It replaces only auth, provider/AI, and outbound-email boundaries; no network, credentials, or production data are used.

| Step | Status | Evidence / limitation |
| --- | --- | --- |
| 1. ElevenLabs initiation and booking | pass | Initiation stores the trusted conversation record; real tool dispatch creates a requested, pending-confirmation appointment with caller details. |
| 2. ElevenLabs post-call | pass | Signed webhook writes the call with `startedAt` and scheduled outcome. |
| 3. Calls and appointments lists | pass | Both list handlers return successfully from the same database after the webhook/tool writes. |
| 4. Confirm and decline | pass | Real appointment route confirms the request, invokes the ledger-email boundary, cancels a second request, and accepts an idempotent repeat. |
| 5. Job and customer resolution | pass | The real job POST creates `J-1000` with appointment-derived customer fields; the real non-blocking customers/resolve route creates one customer then matches it on an identical retry. |
| 6. Field update | pass | Typed updates plus real field-audio route coverage: English and Spanish transcription write the immutable ledger and recompute the English projection; Spanish preserves `rawText` and stores `rawTextEn`. Empty/oversized audio, transcription failure, cross-tenant sessions, and job-scoped field grants are covered. The shipped client transport is JSON/base64; an expected-failure multipart probe records that the route does not accept multipart uploads. |
| 7. Job and report | pass | Job GET returns the projection; report email includes CID logo, visible material/labor details, omits pricing language, and hiding either section removes its details. |
| 8. Quote | pass | Real quote draft, edit, hide options, and send transition run; the job moves to `quoted`. |
| 9. Invoice | pass | Real invoice create/edit/send works; a simulated mail-provider failure returns 502 instead of marking the invoice sent. |
| 10. Cross-tenant | partial | The test loops job, appointment, quote, and invoice handlers and gets 403. The public webhook routes are authenticated with provider secrets rather than tenant sessions, so session cross-tenant checks do not apply to them. |

## What still needs a human on a real phone/inbox

- Voice audio quality and live ElevenLabs/Twilio call lifecycle.
- Inbox placement and real provider delivery/reply behavior.
- Browser rendering and document layout at 375px.

# RoofDoctors South Florida — demo handoff (2026-10-14)

## Shareable customer demo

**Live link: https://crm.luxordev.com/try/roofing**

1. **Call and book** — one teal direct-dial action, +1 (689) 204-2643.
2. **See the App** — opens Pipeline with sample requests/bookings.
3. **See voice updates** — opens worked sample job J-1001 in Field. A clearly labelled example shows one spoken note becoming materials, hours and an issue; expand Spanish → English to see translated findings.

The public app is read-only in demo-try-roofing. No signup, microphone permission or setup is needed for the field example. It is labelled “Example · No recording”; it does not pretend to record or save. The prospect's real call appears in the authenticated guided demo-roofing account, not in this public sample. Other industries retain their appropriate booking/visit flows.

## Real call verified after deployment

The owner called on October 14 at **3:56 PM Eastern**, under the name **Kareem**. Provider conversation conv_6201m4xzt682fbht2pqyxjmaqab7 lasted 111 seconds and completed successfully. Its actual transcript/tool results were read: checkAvailability offered October 15 at 10 AM; bookAppointment returned BOOKED; Alice then confirmed the exact date/time. The call also switched from Spanish to English.

Production verification: the operator Calls list and call-detail APIs both return 200 and expose this call; the transcript and appointment link are stored. Appointment ab1qtL7HVhMKag4VjRgH is reserved on capacity unit 0 for **Thursday, October 15, 10–11 AM Eastern**, status requested, pendingConfirmation true, with the call summary and supplied email. No office confirmation or customer email was sent by this review. Call ID: call_elevenlabs_conv_6201m4xzt682fbht2pqyxjmaqab7.

The greeting is currently **Kareems Roofing**, not RoofDoctors. No live rebrand, launch/reset, tool configuration, prompt, hours or routing change was made.

## Guided demo: remaining click-by-click rehearsal

Use a separate browser/incognito window for the public sample so it cannot replace your operator session. Use only your own rehearsal recipients and fictional customer data.

1. Sign in with the existing superadmin account. Open https://crm.luxordev.com/company/calls?preview=demo-roofing. Select Kareem's October 14, 3:56 PM Eastern call. Review the transcript and Thursday 10 AM booking.
2. Click **Booked · open in Pipeline**, then **Confirm & email**. Check your inbox and junk folder for the confirmation. Do not promise an immediate confirmation email before this office action.
3. Click **Create Job**. Check the customer/address and **From call** provenance. Click **Schedule on the Calendar**, select crew/day/time, then **Confirm + email crew** with your own rehearsal recipient. Check the crew/time on the job header.
4. Open the crew QR or copied field link on your phone; enter your name. Allow microphone access when asked. Hold to talk or use start/stop; say a short note such as “Used twelve bundles, Carlos worked eight hours, and the vent boot is cracked.” Review the result, correct it if needed, then save. Check the saved receipt and the correct job. Repeat with a short Spanish note and inspect the English findings. Add a test photo and check that it belongs to this job.
5. Review the findings, quote, report and invoice. Send rehearsal documents only to your own inbox. Check delivered content and links, then record a demo payment and check Billing. These physical microphone/photo, provider transcription and inbox checks remain pending until performed; automated tests do not certify them.

SMS and integrated customer card checkout are not configured production demonstrations. Use email, QR and copied links. Demo Studio Launch replaces shared demo data: do not reset it to find a missing call. The existing live rehearsal booking remains in place; cancel it through the app after the demonstration if no longer needed.

## Release and verification evidence

Application release **341e095** reconciles both histories, including 7b18b16 and be7c3ce. Duplicate task T-208 from the other session is recorded as T-208B. Published to main; GitHub CI [38627178761](https://github.com/K-WAM/AIRoof/actions/runs/38627178761) passed. Vercel production deployment dpl_HkHjmAt41eXuvYW7fb3frPuwdiVa is READY with the exact Git SHA; crm.luxordev.com and ai-roof.vercel.app point to it. Health and landing return 200. A subsequent documentation-only commit carries this final receipt; the application tree remains unchanged.

- TypeScript and changed-file ESLint pass; optimized production build passes.
- Full Vitest: all 247 files accounted for, 1,905 passing tests plus one expected failure. One default-timeout test during simultaneous build load passed in isolation in 522 ms; no source change was needed.
- Release acceptance: 18/18. Real local API call-to-cash: 12/12.
- Full final-tree desktop/375px browser suite: **182 passed, 10 intentional skips, 0 failures**, without retries. Includes screen/role audit, viewer isolation and operator call → booking confirmation → job → crew flows. App code was not edited during the run.
- Desktop and phone landing/Field/Spanish screenshots visually inspected; no horizontal overflow or tour overlap. Full screenshots and logs are preserved in the roofing-demo-release artifact folder.
- Live ElevenLabs: five existing availability/conflict/closed-hours scenarios passed with the real per-call prompt and full current tool configuration. The legacy exact-booking fixture lacks a required ZIP, so the assistant correctly asks for it. Two new companion tests pass: missing ZIP must not book; complete details plus explicit consent book exactly 10 AM. **Seven current checks pass**. Saved fixtures use a September 27 test clock to match their stated dates; the production clock is unchanged. Provider tools are mocked in these tests, so the separate real call above is the booking evidence.

Provider companion tests: test_0501m4y02yepe7kvcdgpx92g2cbk and test_2001m4y02yjne0qthvc96p29etbz; invocation suite_7401m4y03dgbehrr55qme843nq60. Existing five passing scenarios: invocation suite_5201m4y00zp7fq1s842zympmak3j. Existing fixture definitions and the stored live assistant were not changed.

## Security and recovery

Public tokens target allowlisted industry samples only; omitted industry safely opens the roofing sample, invalid live-tenant input returns 400. Production viewer role/tenant verified; sample booking/Field reads return 200 and live-call reads return 403. Existing auth/tenant/Firestore guards, correction confirmation and manual send gates remain intact. Viewer write controls are hidden and server denials are covered by the local browser/unit gates.

The legacy sandbox-visitor@luxordev.com membership on demo-roofing was retired using the existing Team API after deployment. Its membership is inactive, Firebase Auth disabled and refresh tokens revoked. The separate sample viewer remains active. No sample seed/reset, live assistant update or unrelated customer/job data change was performed. The owner's intentional rehearsal call created the booking above.

Dependency audit: 0 critical, 14 moderate and 11 high findings in existing dependency chains. The critical release gate passes; the planned dependency migration remains backlog.

Only **main** remains as a local or remote branch. Obsolete branch commits were checked for reachability before deletion; all source histories are retained. The unique old setup documentation commit bf9c977 is protected by local tag archive/task-setup-ux-2026-10-14. Old worktrees are parked detached with their files intact, including unfinished HoursEditor edits and call-live temporary files. No recursive worktree/node_modules removal was performed.

Previous production deployment for recovery: dpl_5WwCEHovuWjainu3cLnUY3wb6MgH (ee14ee1). Do not roll back merely because a physical inbox/microphone check is still pending.

## Required sandbox secret rotation

The repository-required Stripe CLI configuration check exposed a sandbox secret in this private session. No live secret was printed and no Stripe resources were changed. Rotate that sandbox secret:

1. Open the Stripe Dashboard and select the sandbox/test account.
2. Open **Developers → API keys**.
3. On the exposed **Secret key** row, open the overflow menu → **Rotate key**.
4. Choose the expiration, rotate, and save the replacement in the approved secret store.
5. Update any sandbox consumers before expiring the old key. Never paste it into chat or commit it.

[Stripe's official key-rotation instructions](https://docs.stripe.com/keys#rotate-an-api-key). All subsequent credential checks were redacted. This remains a NEEDS-HUMAN item.

# RoofDoctors South Florida — demo handoff (2026-10-14)

## Customer-facing flow

Share https://crm.luxordev.com/try/roofing after this release is Ready. The landing has one teal call action and three steps: Call and book; See the App; See voice updates. Step 2 opens sample requests/bookings in Pipeline, so a visitor sees records immediately. Step 3 opens worked sample job J-1001 in Field, with an explicitly illustrative voice note, materials/hours/issue summary and optional Spanish-to-English findings. Existing job scope and translated crew notes remain visible. No worker signup or microphone permission is needed to understand the public example. Public access remains viewer-only in demo-try-roofing; a real call is visible only in the authenticated guided demo-roofing account.

## Guided demonstration and live rehearsal

Use a separate browser/incognito window for the public sample so it cannot replace your operator session.

1. Sign in to https://crm.luxordev.com/hub/demo with the existing superadmin account. The US line is +1 (689) 204-2643; America/New_York. The inspected live greeting is currently Kareems Roofing. Check the greeting before RoofDoctors sees it. Demo Studio Launch replaces shared demo data, so do not reset it merely to find a missing call.
2. On your phone, dial the line. Use a fictional name such as Demo RoofDoctors October, a fictional South Florida address/ZIP and your own email. Ask for an open weekday inspection slot and explicit date/time confirmation. Hang up; record the caller name and approximate Eastern time.
3. Open https://crm.luxordev.com/company/calls?preview=demo-roofing. Open your new call and read its transcript and booking. The integrator must also read the provider transcript, including tool calls/results, before the booking change is certified.
4. Click Booked · open in Pipeline, then Confirm & email; check your own inbox. Click Create Job and check From call and the correct customer/address.
5. Click Schedule on the Calendar, choose crew/day/time and Confirm + email crew using only your own rehearsal recipients. Verify crew/time on the job header. Use the crew QR or copied field link on a phone, enter your name, hold to talk or tap start/stop, then check the saved receipt and correct job. Repeat with a short Spanish note and inspect the English result. Actual microphone/transcription cannot be certified by the keyless harness.
6. Review findings, quote, report and invoice; send only to your own inbox for rehearsal. Record a demo payment and check Billing. SMS and integrated card checkout are not configured production demonstrations; use email, QR and copied links.

## Release evidence

Both source branches are preserved in the reconciliation merge, including 7b18b16 and be7c3ce. Duplicate task number T-208 from the other session is recorded as T-208B in appended planning/evidence notes. Full unit suite: 246 files green; one default-timeout test under simultaneous build load passed immediately in isolation (all 247 files accounted for; 1,905 passing tests plus one expected failure). Release acceptance 18/18; TypeScript and changed-file ESLint clean; optimized production build passes. Local API call-to-cash 12/12. Full desktop/phone browser release run is in progress at the time of this draft; final result and deployment receipt will be added below. No application code is edited during that run.

Visually inspected the 375px landing and desktop Field/Spanish example. Production read-only inspection confirms sample tenant isDemo, worked job J-1001 exists with three notes and one Spanish translation. No seed/reset or live customer/job/booking data was changed.

Security review: public token targets allowlisted industry sample tenants, never the live-call tenant; invalid input is refused. Role/tenant/Firestore guards and send/correction gates are preserved. Viewer office/field write affordances are hidden; server write and foreign read denials are exercised. The old sandbox-visitor@luxordev.com membership is still active on the live tenant and must be retired after the new token route is deployed. Dependency audit: 0 critical, 14 moderate and 11 high findings in existing dependency chains; the critical release gate passes. No breaking dependency migration was folded into this demo release.

## Recovery and cleanup

Old task/setup-ux has one unmerged documentation commit and unfinished HoursEditor files. The commit is protected by local recovery tag archive/task-setup-ux-2026-10-14. That worktree and the old call-live temporary files will be parked intact; they are not added to this release. Other obsolete branches are removed only after ancestry checks confirm their commits are reachable from the active main history. No recursive removal of worktree dependencies or private local files is required.

## Sandbox secret rotation

The repository-required Stripe CLI configuration check exposed a sandbox secret in this local session. No live secret was printed and no Stripe changes were made. Rotate that sandbox secret: open the Stripe Dashboard; select the sandbox/test account; open Developers → API keys; on the exposed Secret key row open the overflow menu → Rotate key; choose the expiration, rotate, and save the replacement in the approved secret store. Update any sandbox consumers before expiring the old key if needed. Do not paste a key into chat or commit it. [Stripe's official key-rotation instructions](https://docs.stripe.com/keys#rotate-an-api-key).

## Final release receipt

Pending final browser run, publication, guest retirement and live agent tests. A real phone booking/tool transcript and physical microphone/inbox checks require the owner's participation; they remain open until actually verified.

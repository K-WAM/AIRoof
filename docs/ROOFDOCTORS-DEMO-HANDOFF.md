# RoofDoctors South Florida — demo handoff (2026-10-14)

## Shareable customer demo

**https://crm.luxordev.com/try/roofing**

Use a separate browser profile or incognito window when testing this link yourself: starting a visitor demo signs that window into its private demo account.

1. **Call and Book** — enter your name, business name and optional confirmation email once; allow microphone access. Alice answers in that business name and books a fictional inspection in English or Spanish. The call happens in the browser. End Call when finished.
2. **See Your Booking in the App** — the actual private booking appears in Pipeline. A prepared inspection job is linked to that booking; the visitor cannot change office schedules or assign crews.
3. **Add a Voice Update** — opens that same job on the field screen, with the visitor's name already filled. Tap the microphone to start, say findings/materials/hours, and tap again to stop. A short note is transcribed, extracted and saved to J-1001. The receipt confirms the job and author; **See Updated Job** opens the office view of those results. **Findings**, **Quote**, **Report** and **Invoice** stay together there. The three document tabs preview this same recorded data; prices are pending office approval, and no document is sent from the visitor demo. Proposed corrections still require Confirm/Cancel.

An email entered in setup is the only recipient for the automatic **[Demo]** customer confirmation. It explicitly describes a demonstration with no real service visit. Without an email, the booking still works and no confirmation is sent. These details are captured as demo enquiries, with no marketing opt-in inferred. In **Hub → Demo → Demo Enquiries → Show Recent Enquiries**, the superadmin can read the latest 20 enquiries on demand.

Each visitor gets a random private tenant, a viewer office login and a job-scoped field grant. They cannot see another visitor's booking or the shared live phone account. One-hour sessions, two calls of at most three minutes, three notes of at most 30 seconds/~512 KB, 24 receptionist tool calls and six explicit correction confirmations are enforced. Private field grants cannot upload photos, clock time or write findings directly. Daily creation limits: 20 globally, 3 per IP, 2 per supplied email. The separate authenticated browser assistant (agent_4301m4y2s2fce18sgxfagn3wjh2j; production DEMO_TRIAL_AGENT_ID) permits only crm.luxordev.com, concurrency 2, daily 40, no bursting and no phone bindings. Expired access is denied; daily cleanup deletes marked private trial accounts/data after a 24-hour grace period and keeps the enquiry contact.

**Guided Phone Demo** is a collapsed fallback: it retains +1 (689) 204-2643 and **Open Sample App**, the older read-only sample with its Spanish → English example. This shared phone line feeds authenticated demo-roofing, not an individual's browser trial. Personalized phone-to-private-demo matching is deferred: it needs verified caller association to avoid mixing visitors. Other industries retain their previous sample flows.

## What happened on Kareem's actual phone call

Carrier metadata and the initiation caller variable both show **+1 (825) 488-7791**. The call did not come from the 510 number. Alice's initial “71” was a readback mistake; she later read 7791 correctly. The booking stored the correct callback number and kareem.awad@live.com. The revised prompt explicitly supplies all four digit words, including repeats; address and ZIP readbacks use individual digits (317 → “three one seven”) while tool arguments keep numeric addresses.

The greeting **Kareems Roofing** and office inbox **kwamwad@gmail.com** were already saved in the shared demo business. Its contact phone is 5104537871; that is the business's contact number, not caller ID. There is no evidence identifying who entered that older name. In **Hub → Demo → Currently Answering As → Change Name & Office Email**, edit the two values and click **Save Demo Details**. This updates greeting/office recipient without reseeding or deleting calls. **Launch** still refreshes shared demo data; do not use it just to rename a business or find a call.

The Gmail screenshot was an office **New Appointment Request**, intentionally addressed to that saved notification inbox. It was not a customer confirmation sent to the wrong address. Normal businesses still use **Confirm & email** for customer confirmation. Emails now identify their office purpose and omit the internal call ID; diagnostic IDs remain in internal records.

The owner's call started **October 14, 3:56 PM Eastern**, lasted 111 seconds and reserved **October 15, 10–11 AM Eastern**. Provider transcript/tool results, stored call and operator Calls APIs were verified. Appointment ab1qtL7HVhMKag4VjRgH remains requested/pending office confirmation; no office send or reset was performed by this review. Provider conversation conv_6201m4xzt682fbht2pqyxjmaqab7.

## Guided demo and final physical rehearsal

1. Sign in as superadmin in your normal operator window. Open **Hub → Demo**, verify the greeting and office recipient, and use **Change Name & Office Email → Save Demo Details** if needed. Do not click Launch to rename.
2. Open https://crm.luxordev.com/company/calls?preview=demo-roofing. Select Kareem's October 14 call, then **Booked · open in Pipeline → Confirm & email**. Check the supplied customer's inbox and junk folder. This is a real send; use only your own rehearsal recipient.
3. Click **Create Job**, check caller/address and From call provenance. Click **Schedule on the Calendar**, select crew/day/time, then **Confirm + email crew** with your own rehearsal recipient. Verify crew/time on the job header. These office actions belong in your guided demonstration.
4. For the private browser experience, open the shareable link in incognito. Click **Call and Book**; enter “RoofDoctors Demo”, “RoofDoctors South Florida” and your own email; click **Start My Demo → Allow microphone**. Ask for a weekday roof inspection and give a fictional Florida address with ZIP ; no phone number is needed. Listen for the exact booking result, then **End Call → See Your Booking in the App**. Check the demo confirmation in your inbox/junk folder.
5. Click **3. Add a Voice Update**. Tap the microphone, say “Used twelve bundles of shingles. Carlos worked eight hours. Found a cracked vent boot,” then tap to stop. Check the saved receipt and **See Updated Job**. Repeat with a short Spanish note and inspect the English findings. The owner has completed a physical browser call and one short microphone field recording; provider audio and the saved note were checked. Inbox placement and a full Spanish field-note rehearsal remain manual checks. Synthetic speech tests do not certify inbox placement.
6. In the guided operator account, test the crew QR/field link on a real phone, add a photo, and review findings, quote, report and invoice. Send documents only to your own inbox. Check delivered links; record a demo payment and check Billing. SMS and customer card checkout are not configured production demonstrations.

The post-deployment shared-line booking/transcript gate is complete; see the final physical result below. Earlier calls above are historical evidence for their respective releases.

## Screen-by-screen review

| Screen | Usability/function review and evidence |
|---|---|
| Roofing entry | Three centered actions; one teal primary; explains bilingual reception, office automation and voice findings. Desktop/375 px checks cover visibility and overflow. |
| Private setup | Name, business and optional email once; no password or phone-number setup. Business name personalizes the greeting; setup name/email are authoritative. The short private prompt skips phone, email and SMS intake; the shared phone script retains its normal checks. |
| Browser call | Official SDK, microphone/speaker worklets and resampling; disconnect and first-time call setup tested against a mocked provider. Live provider smoke and the owner's physical microphone/speaker rehearsal are separate checks. |
| Calls / Pipeline | Actual tool booking, transcript and private tenant association checked. Only the supplied email receives the demo confirmation; normal businesses keep office Confirm & email. |
| Job | The booking prepares J-1001; field results keep that appointment/call association. Prominent Add a Voice Update remains at the top of the office app. Findings and document tabs stay visible; inferred completion progress is hidden in the private preview. Tests wait for loaded title, note and history. |
| Field | Name prefilled; visible microphone, typed fallback, saved receipt and same-job output. Private install prompt suppressed and navigation shortened. Owner rehearsal includes actual microphone/call audio and a four-second field recording with no parse error. The controlled live speech fixture saves 12 bundles, 8 hours and a vent-boot issue. Expiry, three model notes, six correction confirmations and note-only grants remain enforced. |
| Calendar / crews | Guided office call → request → create job → crew/day/time → confirmation path covered through real local APIs/browser. Private visitors retain viewer office access. |
| Quote / report / invoice / Billing | Private Quote/Report/Invoice render actual same-job crew findings/materials/labor through the standard document renderer. Explicit demo preview/not sent; prices pending office pricing, no invented totals or completed repairs. No AI calls or sends from previews. Guided office manual sends, customer acceptance, photos and payments remain covered by call-to-cash/browser gates; real document inbox checks remain manual. |
| Customers / Library / Team / Settings | Owner/viewer/crew navigation and page loads checked on desktop and phone; crew edits, role changes and Library selection remain covered by the existing flow tests. Private visitors retain office viewer permissions. |
| Demo Studio | Current greeting/office inbox visible; safe editor preserves bookings. Enquiries are server-only, superadmin-only and loaded on demand. Launch/reset remains a separate, clearly described action. |
## Follow-up rehearsal findings (T-216–T-218)

The owner's browser trial on October 14 at approximately 7:36 PM Pacific used the entered business name **kareem roofing**, saved one inspection for October 15 at 9 AM Eastern, and saved two field updates. No setup email was supplied, so no customer confirmation was sent; speaking an email during the call does not replace setup consent. Provider audio flags confirm actual microphone and response audio; one saved field recording is four seconds with no parse error. The later shared-phone call at October 14 8:34 PM Pacific read all four ending digits (7791), spoke the house number as three one seven and automatically reached the app as ended with 39 transcript turns.

The rehearsal exposed conflicting intake rules: the long general phone checklist overrode the appended private shortcut and took almost the full three minutes. The dedicated private prompt now asks only missing inspection/address/time details and uses setup contact data. The trusted tool route also enforces setup name/email and disables private SMS consent. Real-model exact-time and known-intake scenarios pass. Normal shared phone behavior is unchanged.

Three known demo calls had timed-out post-call deliveries. Their actual provider transcripts were recovered under strict conversation/tenant/agent checks: 19 and 7 turns for the two QA calls, 38 turns for the owner's call. Existing bookings/jobs were preserved and no messages sent. This was a controlled repair, not evidence of a new automatic delivery. The deployed fix saves raw ended-call facts before optional AI enrichment; each primary/fallback classification request has a 10-second abort and no SDK retries. The later shared-phone call on release 7dc0b8c verified fresh automatic ended-call/transcript delivery. Private stale-call recovery remains explicitly historical.

**Provider retry setting needs owner access:** the existing Luxor post-call webhook has retries off. Its restricted API key returned HTTP 401 when asked to enable retries; destination/authentication/events were not changed. The browser alternative reaches the ElevenLabs sign-in screen, so account access is required.

1. Open [ElevenAgents Settings](https://elevenlabs.io/app/agents/settings) in your signed-in ElevenLabs window.
2. Find the post-call webhook selection and confirm it uses **Luxor post-call**.
3. Open the existing webhook's settings (under account/workspace **Settings → Webhooks**, or **Developers → Webhooks** if shown in your sidebar).
4. Enable retries and save. Preserve its URL, HMAC secret and selected events; do not create another webhook.

[Provider webhook/retry documentation](https://elevenlabs.io/docs/eleven-api/resources/webhooks).

**Operator test limit:** two controlled QA trials and the owner's trial used today's three starts on this IP. Existing sessions last one hour; there is no counter reset or guard bypass. If a new incognito trial reaches the daily limit, use the guided phone/operator demo or wait for the daily reset at midnight UTC. Prospects on other IPs remain subject to their own three-start limit and the shared 20/day cap.

## Shared-phone rehearsal follow-up (T-220)
The latest call checked Monday 11 AM and booked it, then offered Friday 8/8:30/9 without checking tomorrow or Friday 11. Saying Friday 11 was unavailable was unsupported by the tool results. The caller requested a switch, but a second appointment was created: Monday October 19 at 11 AM and Friday October 16 at 8 AM. Both records are preserved; review them in the guided account before manually cancelling an unwanted test appointment.

The follow-up prompt clarifies the day instead of choosing Monday, checks an exact requested time even when it is absent from the shortlist, states a verified unavailable result first, and reuses contact details and no-email/no-text answers. A switch must use the existing caller-verified lookup and explicit cancellation confirmation before replacement. Six synthetic real-model regressions pass, as do two successful change phases and the new server-refusal wording. One adversarial failed-cancellation fixture still tries/offers an extra appointment despite the instructions; that failure is preserved. The server independently blocks a duplicate active visit or an unresolved cancellation, including concurrent attempts and legacy records. Different sites/services/callers can still be booked on one call; office scheduling is unchanged. Existing phone/private release scenarios pass. The follow-up is live on cf6ff5f; all 18 post-deploy release agent checks pass. The separate failed-cancellation adversarial fixture remains documented above and is not counted as passing. The fresh real phone booking/transcript gate through this release passed; see the result below.

## Release evidence and security

Application source **cf6ff5f** is live. [GitHub CI 38682622758](https://github.com/K-WAM/AIRoof/actions/runs/38682622758) succeeded; source deployment **dpl_3fB74f1xXSVT9hnLMBGiYoW2wn5X** reached READY on both production domains. Subsequent documentation-only deployments preserve the same tested application source. Public health/landing returned HTTP 200. Final unit suite: **252 files, 1,950 pass + one expected failure**; optimized production build/type and scoped lint pass (two existing page img warnings retained). Rules **14/14**, real-webhook booking **7/7**, API call-to-cash **12/12**. Complete desktop/375px browser suite: **192 pass, 2 pass on retry, 10 intentional skips, zero remaining failures**, 27.5 minutes. Both retries match local Next dev memory-threshold restarts; their traces are retained. No app source changed during the final run. Desktop and phone screenshots visually inspected, including private landing, field receipt, Findings, Quote, Report and Invoice. Both screen audits pass. The final screenshots/logs and sanitized release receipt are preserved in the roofing-demo-followup artifact directory; later documentation-only deployment metadata is recorded separately. No rules change/redeploy is needed for the guard because existing default-deny rules protect it.

Post-deploy real-model suites pass **7 general + 9 current release + 2 private intake = 18 checks**. These use the actual per-call prompt with synthetic conversations and mocked tools; they do not replace the required physical call or an inbox check.

All production checks use scoped diagnostics; browser automation uses only this checkout's local emulator accounts. Only main remains locally/remotely; old detached worktrees remain parked intact. Unique setup documentation bf9c977 is retained under archive/task-setup-ux-2026-10-14. No recursive worktree/node_modules cleanup was performed.

Protected normal-business tenant scoping, role checks, default-deny rules, manual document sends and field correction semantics remain. Private automatic demo confirmation requires the exact private namespace, both demo markers, an active session and a server-bound call/appointment. Tool calls cannot select another tenant or alternate email; outbound calls and emergency dispatch are unavailable to these trials. Session/prospect records remain server-only. Audio worklets and their pinned resampler are self-hosted; only /try/roofing receives the required WASM/ElevenLabs CSP additions. Other pages retain their previous security policy.

Dependency audit remains 0 critical / 14 moderate / 11 high in existing production dependency chains; the SDK adds no new production findings. The broader dependency migration remains backlog.

## Required sandbox secret rotation

The repository-required Stripe CLI configuration check exposed a sandbox secret in this private session. No live secret was printed and no Stripe resources were changed. Rotate that sandbox secret:

1. Open the Stripe Dashboard and select the sandbox/test account.
2. Open **Developers → API keys**.
3. On the exposed **Secret key** row, open the overflow menu → **Rotate key**.
4. Choose the expiration, rotate, and save the replacement in the approved secret store.
5. Update any sandbox consumers before expiring the old key. Never paste it into chat or commit it.

[Stripe's official key-rotation instructions](https://docs.stripe.com/keys#rotate-an-api-key). All subsequent credential checks were redacted. This remains a NEEDS-HUMAN item.


## Final physical result for this release

**Passed.** The owner’s October 14, 9:45:36 PM Pacific call lasted 84 seconds on application cf6ff5f. Alice explained that Friday 6 PM is outside the configured 8 AM–5 PM office hours, then checked morning availability and offered 8 AM. The caller accepted. One successful booking was saved for **Friday, October 16, 8–9 AM Eastern**, requested/pending office confirmation, with no email or text consent. She did not repeat intake; the owner reported “she was good.”

Provider conversation conv_6101m4yy2g1nf1zvddtczw6zs8wp, its tool calls/results and appointment V0UD4HnL5xKOCd29tps1 were read. Exactly one appointment matches this source call. The app automatically stored ended status and 15 transcript turns; no recovery, cancellation or send was performed. The 6 PM explanation used office hours rather than a calendar query for 6 PM. Phone/address readback was not repeated in this call; the prior rehearsal separately verified it. The AGENTS.md post-deploy booking gate is complete.

The self-guided demo reuses the existing booking engine, job screens, field parser and document renderer. The additional work connected each visitor to a private session, personalized the receptionist, bounded usage and fixed rehearsal defects. Full regression gates and interrupted local runs added time; this was not a separate rebuild of the core product.

Temporary session review credentials and raw provider exports were removed; sanitized receipts and screenshots remain in the artifact directory. Only main remains locally/remotely. Existing owner environment files and parked detached worktrees were preserved.

Remaining owner checks are customer inbox placement with an email entered in setup, Spanish field speech, enabling the existing provider webhook retries and rotating the previously exposed sandbox Stripe key. Exact steps are above. A private email rehearsal needs available daily trial budget; do not reset counters or evade the cap.

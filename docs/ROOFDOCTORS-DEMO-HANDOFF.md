# RoofDoctors South Florida — demo handoff (2026-10-14)

## Shareable customer demo

**https://crm.luxordev.com/try/roofing**

Use a separate browser profile or incognito window when testing this link yourself: starting a visitor demo signs that window into its private demo account.

1. **Call and Book** — enter your name, business name and optional confirmation email once; allow microphone access. Alice answers in that business name and books a fictional inspection in English or Spanish. The call happens in the browser. End Call when finished.
2. **See Your Booking in the App** — the actual private booking appears in Pipeline. A prepared inspection job is linked to that booking; the visitor cannot change office schedules or assign crews.
3. **Add a Voice Update** — opens that same job on the field screen, with the visitor's name already filled. Tap the microphone to start, say findings/materials/hours, and tap again to stop. A short note is transcribed, extracted and saved to J-1001. The receipt confirms the job and author; **See Updated Job** opens the office view of those results. Proposed corrections still require Confirm/Cancel.

An email entered in setup is the only recipient for the automatic **[Demo]** customer confirmation. It explicitly describes a demonstration with no real service visit. Without an email, the booking still works and no confirmation is sent. These details are captured as demo enquiries, with no marketing opt-in inferred. In **Hub → Demo → Demo Enquiries → Show Recent Enquiries**, the superadmin can read the latest 20 enquiries on demand.

Each visitor gets a random private tenant, a viewer office login and a job-scoped field grant. They cannot see another visitor's booking or the shared live phone account. One-hour sessions, two calls of at most three minutes, three notes of at most 30 seconds/~512 KB, 24 receptionist tool calls and six explicit correction confirmations are enforced. Private field grants cannot upload photos, clock time or write findings directly. Daily creation limits: 20 globally, 3 per IP, 2 per supplied email. The separate authenticated browser assistant permits only crm.luxordev.com, concurrency 2, daily 40, no bursting and no phone bindings. Expired access is denied; daily cleanup deletes marked private trial accounts/data after a 24-hour grace period and keeps the enquiry contact.

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
5. Click **3. Add a Voice Update**. Tap the microphone, say “Used twelve bundles of shingles. Carlos worked eight hours. Found a cracked vent boot,” then tap to stop. Check the saved receipt and **See Updated Job**. Repeat with a short Spanish note and inspect the English findings. This physical microphone/speaker and real transcription/inbox rehearsal remains owner verification; synthetic audio/provider tests do not certify a physical device or inbox placement.
6. In the guided operator account, test the crew QR/field link on a real phone, add a photo, and review findings, quote, report and invoice. Send documents only to your own inbox. Check delivered links; record a demo payment and check Billing. SMS and customer card checkout are not configured production demonstrations.

A booking prompt change also requires a new short shared-line phone call after deployment and transcript/tool-result review. The October 14 call above proves the prior live booking, not the revised readback wording.

## Release evidence and security

Current private-demo release verification is recorded in SESSION_HANDOFF, TODO and IMPLEMENTATION_LOG. Earlier 341e095/83e0c6a release receipts remain historical. Only main remains locally/remotely; old worktrees remain parked intact. Unique setup documentation bf9c977 is preserved under archive/task-setup-ux-2026-10-14. No recursive worktree/node_modules cleanup was performed.

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

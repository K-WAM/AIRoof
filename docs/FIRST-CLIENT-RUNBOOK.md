# FIRST-CLIENT-RUNBOOK.md — turning a signed prospect into a live tenant (T-131)

Written 2026-09-26, for the owner. Roofing is the worked example because it's the first vertical sold; every step
below is the same for any of the 13 industries in `src/lib/verticals/templates.ts` — swap "roofing" for the client's
actual trade and the starter kit/vocab/agent prompt follow automatically (see CLAUDE.md's Industry-Applicability
rule). **This is the owner's own sequence.** The step-by-step *reference* material it points to is
`docs/ADMIN-ONBOARDING.md` (older, partly stale — see the note in step 2) and `public/guides/onboarding-guide.html`
(current, client-facing, printable). Don't duplicate their content here; this doc is the order of operations and the
decisions only the owner makes.

## Before the first call with the client
- Confirm which of the 13 industries fits them (roofing, HVAC, plumbing, electrical, etc. — see the template list).
  If none fits well, that's a real gap to flag, not something to force into the nearest template.
- Have ready: their business name, service area, business hours, the services they actually offer (not a generic
  list), an escalation phone number (a real person who answers after-hours emergencies), a notification email.

## Step 1 — Create the tenant
Superadmin → Admin → Clients → **+ Client** (quick-create modal, `admin/businesses/NewClientModal.tsx`) — this is the
current, fast path; it's what `POST /api/admin/businesses` does under the hood. Fill in name, industry, address,
employee count, seat limit. This replaces the older manual-Firestore-document steps in `docs/ADMIN-ONBOARDING.md`
step 2 — use the modal, not the console, unless the modal is missing a field you need (then that's a gap to log, not
a reason to hand-edit Firestore).

## Step 2 — Run the onboarding wizard
Hub → Onboarding (`/hub/onboarding`, six panels): business profile, industry template (confirms the template picked
in Step 1 and its starter services/FAQs), defaults (edit the seeded services/FAQs to match what THIS client actually
offers — never leave the generic template text as if it were their real service list), phone/routing, voice-provider
setup, and a readiness checklist. **Note:** this wizard's voice-provider panel predates the ElevenLabs migration and
may still show Vapi-shaped fields — verify what it actually asks for before relying on this doc's description; if it
still only sets up Vapi, do the ElevenLabs side by hand per `docs/ELEVENLABS-SETUP.md` and treat that mismatch as a
`TODO.md` gap (the wizard should default new clients to ElevenLabs, since Vapi is retired from demos and T-117's
migration direction is ElevenLabs-first).

## Step 3 — Load the starter kit
Company → Library (as the client, or superadmin `?preview=<businessId>`) → **starter kit** (`POST
/api/company/library/starter-kit`, one click) seeds the industry's example pricing/materials/labor/work-catalog
items. These are marked `starter: true` and flagged as example prices in the UI — **the client must review and
correct every price before their first real quote goes out.** Don't skip this step thinking the defaults are "close
enough"; a customer-facing quote with a wrong price is a bigger problem than a slower onboarding.

## Step 4 — Get them a phone number
There is no in-app number purchase yet (`T-054`, post-MVP). Manually:
1. Buy a local number for their area in the Twilio (or ElevenLabs-native, if that option exists by the time you read
   this — verify) console.
2. Import/assign it to an ElevenLabs agent per `docs/ELEVENLABS-SETUP.md`.
3. Set `elevenlabs.agentId` / `elevenlabs.phoneNumber` on the client's business config (Admin → Clients → their
   config page) so `findBusinessByElevenLabsPhoneNumber` resolves calls to their tenant, not the demo line.
4. Run `scripts/setup-elevenlabs-agent.mjs` against their agent to push the 7 tools and webhook config.
This is the same mechanism as `docs/CANADIAN-DEMO-NUMBER.md`, minus the "second number on a shared demo tenant"
complication — a real client gets their own agent and number, never a shared one.

## Step 5 — Set the things that protect the client and their customers
- **Escalation phone** — a real number that rings a real person for genuine emergencies. Never leave the seeded
  placeholder (`+1 555 000 0000`-shaped values exist in seed scripts for a reason — they must never reach a live
  client).
- **Recording notice** (`src/lib/recordingDisclosure.ts`) — confirm the client's state's call-recording consent law
  (one-party vs two-party) before deciding whether the spoken notice can ever be turned off; default is ON for a
  reason.
- **Legal/document notices** — if the client is in Florida, `docs/FLORIDA-DOCUMENT-NOTICES.md`'s DRAFT wording needs
  attorney review and the owner's "reviewed" approval in Settings → Documents before it can appear on a real
  document. A client outside Florida needs their own jurisdiction's wording researched — don't reuse Florida's.
- **Branding** — logo, brand color, contact info on the letterhead (Library → Branding). A client-facing document
  with Luxor's own placeholder branding is not ready to send.

## Step 6 — Team access
Company → Team: invite the client's staff by email/role (owner/staff/viewer). Confirm they understand: a viewer is
read-only (can't log field updates or complete jobs); only office roles (owner/staff, not the crew's field session)
can mark a job complete or make billing decisions (Phase 25's E1 restriction). Print/share `public/guides/
onboarding-guide.html` for their own staff's first login.

## Step 7 — One supervised test cycle before going live
Place a real test call to their new number (not the demo line) and walk it end to end: booking → Pipeline review →
confirm → job → a field update → a quote → a report → an invoice, exactly like `docs/DEMO-DAY-RUNBOOK.md`'s script
but on the client's own tenant and number. Use the smoke harness (`docs/SMOKE-HARNESS.md`) beforehand to catch any
UI regression risk-free; use a REAL call for this step, because the harness cannot verify actual phone audio or a
real inbox landing correctly (see the harness doc's "what it cannot check" list).

## First-week check-ins
- Day 1: confirm their first real customer call went where it should, and that they got the recording-notice wording
  right for their situation.
- End of week 1: review Admin → Usage for their tenant (calls/leads/appointments) — a silent tenant with zero calls
  might mean the phone number or call forwarding isn't actually pointed at the new line yet, not that business is
  slow.
- Ask what confused them. That answer becomes the next `docs/ROOFING-DEMO-UX-REVIEW.md`-style task, not a support
  ticket to just close out.

## Billing (only if this client is a paying, non-trial account)
Recurring Luxor billing is invoice-based today (Admin → Invoices, `LX-XXXX` numbering, a daily
`cron/recurring-invoices` draft-only cron) — **not** a Stripe subscription; Stripe integration (`T-126`) is HELD on an
owner pricing decision. If/when that's built, see the standards repo's `SETUP/Stripe Setup (Account, Products,
Checkout, Webhooks).md`, and specifically its "direct vs Connect" note (added 2026-09-26) — this platform bills its
own tenants directly (Luxor is the merchant of record), which is the "direct" pattern, not Stripe Connect (which is
for a marketplace paying out to many separate merchants). Don't reach for Connect here; it solves a problem this
product doesn't have.

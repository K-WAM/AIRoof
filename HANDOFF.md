# HANDOFF — AI Receptionist Platform
Last updated: 2026-06-15 (Demo Studio + dynamic per-industry agent + after-hours + security + universal demo line)

## Current State

**Completion: ~98%** — live at https://ai-roof.vercel.app. Everything below is shipped and (where noted) verified in production.

---

## This session — what shipped (all build + tsc green, pushed to main)

1. **Demo Studio (multi-vertical)** `1c0b388` — `/admin/demo` rebuilt as a 3-step pick→prospect→launch studio for 6 verticals (Roofing, HVAC, Landscaping, Dental, GC, Property Mgmt), per-industry personas/pitch scripts/brand colors, Firestore-driven nav-module hiding (Dental & Property Mgmt hide Jobs/Library).

2. **Dynamic per-industry Vapi prompt + Canadian timezones** `16d51ed` — the `assistant-request` webhook now builds the FULL system prompt + greeting from each business's own config (`buildAgentPrompt`) and serves them as Vapi vars `{{systemPrompt}}` / `{{greeting}}`. One assistant adapts to any vertical. `resolveBusinessId` resolves **by phone number first** (assistant-id fallback). Timezone picker gained Canada (`SUPPORTED_TIMEZONES`).

3. **UX unification + login hardening** `46b37bd` — `/company/leads` and `/company/appointments` are now redirects into the unified **Pipeline** (single source of truth); Pipeline reads `?urgency=urgent` (fixes the dashboard "Urgent leads" link) and `?lead=<id>` deep-select. CommandBar now searches appointments too and deep-links to the record. Removed public self-signup from `/login` (was creating orphan accounts) + Luxor branding. `alert()` → inline toast.

4. **Security: all `/api/admin/*` gated** `bf7c249` — every admin route was UNAUTHENTICATED. Added `verifySuperadmin()` (`src/lib/auth/verifyRole.ts`) to all ~17 admin handlers. Cookie-based, so no client changes. Curl-verified: every admin endpoint returns 401 without a valid session. **Verified live in prod (401).**

5. **After-hours done end-to-end** `aa0a843` — customer email captured at booking (`Appointment.callerEmail`); "Confirm & notify customer" now actually emails the **customer** (`sendCustomerConfirmation`, was only emailing the business), fixes the hardcoded tz, always confirms even without email. Dashboard surfaces an **"After-hours — Pending Your Approval"** section + clickable pill → Pipeline. Cards clickable app-wide.

6. **Caller-ID phone + optional email + playbook accuracy** `0e1e5a7` — webhook feeds caller ID into the prompt; the agent **confirms the number casually** ("…ending in 4821?") instead of making the caller recite it. Email is explicitly **optional** (offered once, never blocks). Rewrote the guide/Demo Studio to say the agent adapts to *every* industry; "Voice: Pending" = no phone line connected for that vertical yet, not an agent limit.

7. **Universal demo line** `71c5758` — `demo-roofing` is the single live demo tenant (owns the Vapi number + assistant). Each Demo Studio launch **reconfigures it in place** to the chosen vertical (config + reseeds sample data via `src/lib/verticals/demoSeed.ts`), so the **one number adapts** to whatever you launched. One seeded appointment is an after-hours pending booking WITH an email, so the approval flow is demoable immediately. (Reconfigure-in-place, not remap, to avoid the phone-number lookup cache going stale.)

8. **Vapi tools/config verified via API** — confirmed System Prompt = `{{systemPrompt}}`, First Message = `{{greeting}}`. Added the optional **`email`** param to the `bookAppointment` and `createLead` tools (was missing → live calls couldn't pass an email). Optional (not in `required`); webhook/server config intact. *(Vapi-side change, no deploy.)*

---

## Vapi Architecture (current)

- **Assistant**: `9267a84a-0f4f-416b-a328-1dc539f5265e` ("Alice - Roofing" = the universal demo line / `demo-roofing`).
- **Phone**: +1 (754) 283-7658. **Webhook**: `https://ai-roof.vercel.app/api/webhooks/vapi`.
- **Prompt is dynamic**: System Prompt = `{{systemPrompt}}`, First Message = `{{greeting}}`, both served by the `assistant-request` webhook from the resolved business's config. Do **not** overwrite those two fields with literal text.
- **Tenant resolution**: by phone number first, then assistant id (`resolveBusinessId`).
- **7 tools** (by id): bookAppointment, createLead, escalateCall, checkAvailability, lookupAppointment, cancelAppointment, getCurrentDate. bookAppointment + createLead now include an optional `email` param.
- **Keys (3, don't mix up):** **Private key** = `VAPI_API_KEY` (server REST + outbound); **Public key** (browser only); **`VAPI_WEBHOOK_SECRET`** (inbound verification, bypassed via `VAPI_AUTH_BYPASS=true`). `VAPI_API_KEY` + `VAPI_WEBHOOK_SECRET` are **Sensitive** in Vercel (can't be read back via `vercel env pull`).
- **Voice**: Vapi "Layla" / Cartesia stack, GPT-4o Mini, Deepgram nova-3. ~$0.09/min, ~840 ms. (ElevenLabs = max raw realism at higher latency if you ever want to A/B.)

## Demo Instructions (universal line)

1. Log in at `/login` → connect@luxordev.com (must be superadmin; if admin pages 401, run `node scripts/provision-superadmin.mjs` then sign out/in).
2. `/admin/demo` → pick industry → enter prospect company + email → **Launch**.
3. The launch panel shows the live number **for every vertical** now. Hand the prospect the phone → the agent answers **as that industry/company**, confirms their number from caller ID, optionally asks for an email, books.
4. **Open dashboard** (opens the live line) → show Calls/Pipeline + the seeded **after-hours "Pending Your Approval"** booking → **Confirm & notify customer** (emails the customer).
5. Field-service verticals: scan the QR for the voice field-update demo.
6. **Reset demo** restores the roofing default.

## Pending / Next

- **Mobile responsiveness** — the company topbar (logo + nav + search + user) likely overflows on phones; needs a responsive pass. Main untested surface.
- **Email deliverability** — confirm `RESEND_FROM` uses a verified domain so customer confirmation emails land cleanly.
- **Vestigial** — per-vertical demo businesses (`demo-hvac`, etc.) are unused now that the Demo Studio runs on the universal line (`demo-roofing`). Harmless; left in place.
- **Minor** — favicon 404; admin "Field Demo"/"Client view" links hardcoded to `demo-roofing`; `__session` cookie ~1h staleness on very long admin sessions.
- **Post-MVP** — Google Calendar per-business OAuth, Stripe billing, SMS (Twilio A2P 10DLC), more verticals going live (connect a number per the guide's "Connecting a phone line to a vertical").

## Key Files (added/changed this session)

- `src/lib/ai/agentPromptBuilder.ts` — `buildAgentPrompt(config, { runtime })`: industry-aware prompt + runtime context (date/time/after-hours/caller phone), contact-capture (caller-ID confirm + optional email).
- `src/app/api/webhooks/vapi/route.ts` — `assistant-request` serves `{{systemPrompt}}`/`{{greeting}}` + caller phone; bookAppointment/createLead read `email`; phone-first `resolveBusinessId`.
- `src/lib/auth/verifyRole.ts` — `verifySuperadmin()`; all `/api/admin/*` handlers gated.
- `src/app/api/admin/demo-customize/route.ts` — universal line: reconfigure + reseed `demo-roofing` per launch.
- `src/lib/verticals/demoSeed.ts` — template-driven per-vertical sample data (incl. an after-hours pending booking with email).
- `src/lib/verticals/templates.ts` — 6 vertical templates (incl. general-contractors) + icon/color/script/disabledModules.
- `src/app/company/pipeline/page.tsx` — unified Leads+Appointments; `?urgency`/`?lead`; tone-aware toast; customer email on appt cards.
- `src/app/company/dashboard/page.tsx` — after-hours pending section + pill; clickable cards.
- `src/app/api/appointments/send-confirmation/route.ts` — notifies the customer (not just the business).
- `src/app/company/{leads,appointments}/page.tsx` — redirects into Pipeline.
- `src/app/login/page.tsx` — sign-in only + branding.
- `src/hooks/useBusinessTimezone.ts` — `SUPPORTED_TIMEZONES` (US + Canada).
- `public/guides/onboarding-guide.html` — v2 Demo Studio + accurate per-industry framing.
- `src/types/index.ts` — `callerEmail` on Lead + Appointment.

## Prior epic (Field Ops + Calendar Powerhouse + Library) — still live
Booking fix (`ignoreUndefinedProperties`); unified voice-correctable job data (`src/lib/jobs/projection.ts`); job-site photos (base64 split, free Spark); editable report + Mail gate; Library (pricing/crews/docs); Calendar Powerboard (@dnd-kit). See `docs/EPIC-PLAN.md`.

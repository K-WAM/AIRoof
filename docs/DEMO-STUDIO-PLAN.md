# Demo Studio Plan — Multi-Vertical Receptionist

**Status:** Saved for later. Assess after current platform reaches stable demo state.
**Source:** Codex plan, reviewed 2026-05-30.
**Verdict:** Solid direction. Execute when ready to scale beyond roofing to 2+ active verticals.

---

## Summary

Build a **Receptionist Demo Studio** replacing `/admin/demo` with a frictionless command center.

Target flow: **under 60 seconds to configure, under 3 minutes to first wow moment.**

- Step 1: choose vertical (roofing, dental, HVAC, spa, landscaping, medical)
- Step 2: enter prospect company name + notification email
- Step 3: click "Start demo" → app shows: call number, dashboard preview, sample caller script, reset button
- No buried settings, no manual Firestore/Vapi edits during a sales call

---

## Key Changes

### Demo Studio UI
- Replace `/admin/demo` with vertical selector + one-click setup
- Show status chips: `Voice ready`, `Dashboard only`, `Needs setup`
- Show exact Vapi number to call + active assistant + active tenant
- Show reset banner when demo has been customized
- Disable "Start voice demo" when required Vapi IDs are missing
- Deep-link to `/company/dashboard?preview=demo-{vertical}`

### Vertical Templates (`src/lib/verticals/templates.ts`)
Add complete templates for:
- `roofing` (exists) — emergency roof damage, inspections, shingle/metal
- `dental` — appointment booking, reminder calls, no diagnosis/medical advice
- `hvac` — emergency heating/cooling, seasonal maintenance scheduling
- `spa` — service menu, booking, rescheduling
- `landscaping` — seasonal quotes, project scheduling, field crew dispatch
- `medical-clinic` — intake, scheduling, urgent escalation; MUST refuse diagnosis

Each template includes: services, FAQs, emergency rules, booking rules, disallowed topics, receptionist name, tone, greeting, sample call script, dashboard module preferences.

### Seeded Demo Tenants
One per vertical: `demo-roofing`, `demo-dental`, `demo-medical-clinic`, `demo-spa`, `demo-hvac`, `demo-landscaping`.
Each gets realistic fake calls, leads, appointments so no page feels empty.

### Generalized `/api/admin/demo-customize`
Accept `{ verticalId, companyName, notificationEmail, brandColor? }`.
- Resolve matching demo business
- Apply selected vertical template
- Update Firestore business config
- Patch matching Vapi assistant first message (when available)
- Return: dashboard URL, call number, assistant status, warnings

### UI Cleanup
- Hide `Jobs` and `Field` modules for dental, medical, spa demos (not relevant)
- Remove roofing-specific language from shared UI and emails
- Preload dashboard data immediately after customization

---

## Vapi Plan

- Pre-create one Vapi assistant per voice-demo vertical (fastest reliable path)
- Do NOT create/reconfigure full assistants during a live demo
- Each demo assistant: same server URL, same tool set, vertical-specific system prompt + first message
- Dedicated phone number per vertical if possible
- Later: dynamic assistant routing so one number serves multiple verticals (Phase 2)

---

## Test Plan
- Start each demo in under 60 seconds from `/admin/demo`
- Confirm call number or explicit "Dashboard only" state per vertical
- Call roofing/HVAC — confirm lead, appointment, email, dashboard update
- Call dental/spa — confirm appointment intake without field-service language
- Call medical clinic — ask for diagnosis; agent MUST refuse and offer scheduling/escalation
- Reset each vertical and confirm defaults return
- Verify cold page loads, loading states, preview links feel fast

---

## Assumptions
- Frictionless demo quality > minimizing Vapi assistant count
- Voice-ready verticals provisioned before sales calls
- Medical/dental use fake data until compliance work is complete
- First version optimizes for reliability, clarity, and demo speed over automation

---

## Why This Makes Sense

The core insight is right: a multi-vertical pitch needs zero-friction switching. The current `/admin/demo` works for one vertical but requires manual setup for each prospect. The Demo Studio removes that friction and turns every sales call into a live product demo with real data.

**When to tackle:** After the current roofing demo is fully validated (Call Back working, QR demo reliable, after-hours booking confirmed). Likely Phase 6 or when first non-roofing client is onboarded.

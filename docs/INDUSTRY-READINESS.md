# Industry readiness (2026-10-09)

Roofing is the gold standard: the whole chain (call → request → calendar → field notes/photos → quote → report → invoice →
paid) has been walked end to end in the smoke harness and built screen by screen. Every other industry runs the same code,
configured by `src/lib/verticals/templates.ts`. "Readiness" here = **ready to demo to a prospect and onboard a first client**,
not production-proven (no industry, roofing included, has had its full chain proven on a real phone yet).

Demo link to send a prospect: `https://crm.luxordev.com/try/<industry>` — e.g. `/try/pet-care`, `/try/dental`,
`/try/care-homes`. "See it in the real app" opens that industry's own read-only demo business (`demo-try-<industry>`).

| Industry | Ready | What it leads with | What the leading software has that we don't (deliberately not built) |
|---|---|---|---|
| Roofing | **95%** | AI books inspections; crew voice notes + photos; quote/report/invoice | Real-phone proof of the full chain |
| HVAC, electricians, appliance repair, junk removal, general contractors | **80%** | Same job flow, industry words (Tech / Service call…) | ServiceTitan/Jobber: memberships, price books, financing |
| Cleaning, landscaping | **75%** | Book cleans/estimates, team schedule, invoice + record payment | Recurring schedules (weekly clean, weekly mow) |
| Dental | **80%** | AI answers every call, books new patients + same-day emergencies; "reason for visit" captured | Dentrix/Open Dental: charts, insurance, recall — we are the front desk add-on, not the practice system |
| Care homes | **80%** | Tours and admissions calls booked 24/7; who's calling + referral source; never shares resident info | Welcome Home/Sherpa: inquiry stages, follow-up cadence. PointClickCare (clinical) is out of scope |
| Dog walking & pet care (new) | **75%** | Scheduling + getting paid: AI books walks/meet & greets, walkers on one calendar, visit report, invoice, record payment | Time To Pet/Scout: recurring walks, weekly batch invoice, client portal, GPS walk map |
| Daycares, childcare, property management | **70%** | AI books tours / consultations / work orders | Waitlists, enrollment, tenant portal |

## What changed for the non-roofing industries (2026-10-09)

- **Pet care added** (14th industry): Visit/Client/Walker words, set-price services (30/60-min walk, drop-in, overnight), intake
  asks pet type, names, schedule and how to get in. `quotes: false` — no Findings/Quote steps; the job stepper is
  Booked → Working → Done → Invoiced; dashboard tiles: Today's visits / New bookings to confirm / Awaiting invoice. The demo
  has today's walks on the calendar and one finished visit (English + Spanish notes) ready to invoice.
- **Dental:** intake asks the reason for the visit (cleaning / toothache / cosmetic / other).
- **Care homes:** intake asks who is calling (self / parent / spouse / hospital or agency) and how they heard of you — the two
  things admissions teams track. Select-only, no health or identity data (privacy test kept).
- **Every industry:** its own `/try` pitch (headline, 3 points, the flow it actually uses, what to say to the AI) and its own
  sandbox — before this, every link opened the one shared demo business, whatever industry it was last set to.
- **Wording fixes:** Calendar ("Drag visits onto a Walker"), the "Confirm + email {walker}" button, Pipeline "Upcoming
  bookings" and "Provider:"/"Coordinator:" instead of roofing's "Inspections"/"Inspector" outside roofing. Roofing text unchanged.

## Care homes + daycares demo pass (2026-10-10)

- **Demo calls in their own words** (`src/lib/verticals/demoSeedTours.ts`): the shared seed's "what's the service address /
  send someone tonight" calls are replaced with a family booking a tour, a hospital-discharge rush after hours, a Medicaid
  question the AI won't guarantee, and the call that sells it — someone asking how a resident (or child) is doing, and the AI
  refusing to confirm anything while putting them through to staff.
- **Captured intake shows on the Pipeline**: seeded requests carry who is calling / how they heard of you / community type
  (daycares: age range / program). A test pins every value to a real template option.
- **Care homes:** + "Respite or short-term stay inquiry" service and FAQ (senior-living CRMs track respite as its own lead
  type). `/try/care-homes` now suggests trying the privacy question.
- Roofing and every other industry: seed unchanged (a test asserts the same object comes back).
- Not built, deliberately: a separate inquiry-stage board (Welcome Home/Sherpa style). The Pipeline's New → Contacted →
  Booked → Closed/Lost already maps to Inquiry → Follow-up → Tour → Move-in/Lost; a second board would be two ways to do one thing.

## Care homes suite pass (2026-10-10, later) — the frictionless demo

**How to demo a care home (send the link, no call needed):** `https://crm.luxordev.com/try/care-homes` → "See it in the real
app". A **Demo tour** strip on every screen walks them: **1. Calls** ("Open *Caller about a resident* — the AI confirms
nothing") → **2. Pipeline** (who's calling, how they heard of you, community type) → **3. Calendar** (today's tours, one row
per coordinator). Read-only; "Exit demo" returns to the pitch page. Built from the industry pitch, so each industry gets
its own steps (`src/components/demo/DemoTourBanner.tsx`, `tourTip` in `pitch.ts`).

Fixed on the way (visual walk, desktop + 375 px):
- Library opened **blank** for every industry without Jobs (tab picked before the industry loaded).
- Phone-number boxes' validation pattern was invalid in current browsers, so it was silently ignored (all forms).
- Demo Calendar was an empty week Fri–Sun: booking industries now get three tours later today; sandboxes reseed daily.
- Demo banner sent care homes to a Field tab they don't have; red "AI receptionist off" in the demo → "Sample calls".
- Said-once: dashboard "pending approval" pill, "Booking · Confirm booking" chips, and a booked after-hours call that also
  said "Appointment not booked" — removed. Calls lead with the caller's name; escalated reads "Urgent".
- Calendar names broke mid-word ("Administrat/or"); tiles cut names ("Jordai") on a full week.

## Known gaps (next, in order of value)

1. Sandboxes have no phone line, so their dashboard honestly says "AI receptionist off"; only the roofing demo number is live.
   To let a dog walker *call* the AI, point the demo line at pet care in Demo Studio before sending the link.
2. Recurring visits (pet care, cleaning, landscaping) — the single biggest gap versus the leaders.
3. One invoice for many visits (weekly/monthly billing for dog walkers).
4. No seeded photos in the pet-care visit report.

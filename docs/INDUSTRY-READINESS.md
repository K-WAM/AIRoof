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
| Care homes | **75%** | Tours and admissions calls booked 24/7; who's calling + referral source; never shares resident info | Welcome Home/Sherpa: inquiry stages, follow-up cadence. PointClickCare (clinical) is out of scope |
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

## Known gaps (next, in order of value)

1. Sandboxes have no phone line, so their dashboard honestly says "AI receptionist off"; only the roofing demo number is live.
   To let a dog walker *call* the AI, point the demo line at pet care in Demo Studio before sending the link.
2. Recurring visits (pet care, cleaning, landscaping) — the single biggest gap versus the leaders.
3. One invoice for many visits (weekly/monthly billing for dog walkers).
4. No seeded photos in the pet-care visit report.

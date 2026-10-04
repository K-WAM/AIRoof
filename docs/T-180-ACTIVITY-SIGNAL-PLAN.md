# T-180 — "Anything changed?" signal for live screens (plan, 2026-10-04)

Status: **planned, deliberately not built yet.** Read this before building it.

## Why
Dashboard, Pipeline and Calls refresh by polling. The 2026-10-03 pass cut what each poll reads ~10× (merge-only
background refreshes, heavy lists once a minute, idle back-off), but an open screen still reads Firestore every
10–60 s. On Spark (50k reads/day, platform-wide) that is the remaining quota risk. NH-32 (move to Blaze) removes the
risk outright; this task is the alternative if the owner stays on Spark.

## Design
- `businesses/{id}.activity` — a map of `{ calls, requests, jobs }` → last-change timestamp (ms).
- `touchActivity(db, businessId, scope)` in `src/lib/activity.ts` — one merge write, best effort (a failed stamp
  must never fail the write that triggered it).
- `GET /api/company/activity?businessId=` — one doc read, `noStore`, guarded like the other company GETs.
- `useLiveRefresh` gains an optional `probe(): Promise<string | null>`. Each tick calls the probe (1 read); the full
  refresh runs only when the probe value changed — **plus a forced full refresh every 2 minutes and on every
  focus/visibility change**, so a writer that forgot to stamp delays a screen by ≤2 min instead of freezing it.
- Dashboard probes `calls|requests|jobs`, Pipeline `requests`, Calls `calls`. Job detail already polls one doc.

## Every writer that must stamp (found 2026-10-04)
- **calls**: `src/lib/calls/endOfCallWriter.ts`, `src/app/api/webhooks/elevenlabs/{initiation,post-call}`,
  `src/app/api/webhooks/vapi/route.ts`, `src/app/api/calls/outbound/route.ts`, `src/app/api/calls/[callId]/route.ts`
  (PII redaction), `src/app/api/cron/follow-up-calls/route.ts`.
- **requests** (leads + appointments): `src/lib/tools/agentTools.ts` (book/cancel/lead/escalate — **Booking-change
  gate scope**), `src/lib/calls/callLead.ts`, `src/app/api/appointments/[appointmentId]/route.ts`,
  `src/app/api/appointments/send-confirmation/route.ts`, `src/app/api/businesses/[businessId]/{appointments,leads}/**`,
  `src/app/api/jobs/from-request/route.ts` (stamps `jobId` on the request), `src/app/api/jobs/route.ts` (same),
  `src/app/api/admin/demo-customize/route.ts` (reseeds).
- **jobs**: `src/lib/jobs/writeProjection.ts` (covers notes, punches, findings), `src/app/api/jobs/route.ts`,
  `src/app/api/jobs/[jobId]/{route,assign,client,complete,invoice/**,quote/**,photos/**}`, `src/lib/photos/store.ts`
  (`touchJob`), `src/app/api/company/crews/route.ts` (deleting a crew unschedules jobs).

## Gates when built
- Unit: `touchActivity` best-effort; the probe skip/force logic in `useLiveRefresh` (fake timers).
- Because `agentTools.ts` changes, the Booking-change gate applies: booking scenario suite (`npm run e2e:booking`)
  **and one real booking call + transcript read after deploy** before calling it done.
- `e2e/screen-audit.spec.ts` + a spec that books via `simulateCall()` and sees the Pipeline update within one tick.

## Why not built on 2026-10-04
It touches the phone AI's booking code, whose gate needs a real phone call that the building session cannot place,
and a missed writer would silently freeze a screen. Decide NH-32 first: on Blaze this task is unnecessary.

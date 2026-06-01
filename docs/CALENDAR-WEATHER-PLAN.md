# Plan: Calendar Weather Strip + Hourly Day-Planner (NOT YET BUILT)

> Planning only. Two enhancements to the Calendar Powerboard (`src/app/company/calendar/page.tsx`). Built last epic: crews × days drag-drop with confirm + branded crew email. These add (1) a weather strip above the grid and (2) hourly time-of-day scheduling with resizable job blocks.

---

## Feature 1 — Weather forecast strip (with red severe-weather warnings)

**Feasibility: EASY. Not painful.** Free, no API key, no billing — fits the "stay on the free plan" constraint.

### Why it's easy
- **Open-Meteo** (`open-meteo.com`) is free, requires **no API key, no signup**, generous limits. Returns a 7-day daily forecast with exactly what we need (weather code, hi/lo temp, precip probability, wind, precip sum).
- **Open-Meteo Geocoding** (also free, no key) turns a city name → lat/lon. The business already has `serviceArea` (city names) and addresses, so we geocode the primary city once and cache lat/lon.

### Data flow
1. New route `src/app/api/company/weather/route.ts` (GET `?businessId=`):
   - Read business doc → primary city (first of `serviceArea`, or parse address) + timezone.
   - If `business.geo` (lat/lon) not cached: `GET https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1` → store `{lat, lon}` back on the business doc.
   - `GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,precipitation_sum&timezone=auto&forecast_days=7`
   - Cache the result in Firestore (`businesses/{id}/cache/weather` with `fetchedAt`); re-fetch only if older than ~3 h. Weather changes slowly — keeps us well under any limit and instant on load.
   - Return `[{ dateISO, code, hi, lo, precipProb, windMax, severe }]`.
2. Calendar page: fetch once on mount; render a thin strip **above** the crew×day grid, one cell per visible day, aligned to the day columns (same `gridTemplateColumns`). Non-interfering — it's a header band, the grid is untouched below.

### Display + warning logic
- Each day cell: small WMO icon (clear/cloud/rain/snow/storm), `hi°/lo°`, precip%.
- **Red severe-weather warning** when roof-work is risky:
  - `code >= 95` (thunderstorm), `code in {65,67}` (heavy rain), `code in {75,77,85,86}` (heavy snow), `code == 82` (violent showers), OR
  - `windMax > 40 km/h` (≈25 mph — unsafe on a roof), OR `precipProb >= 70%`.
  - Render the cell with a red border + `⚠` and a tooltip ("High wind — unsafe for roof work"). Otherwise neutral.
- WMO code → label/icon map lives in a small `src/lib/weather/wmo.ts` helper (pure, reusable).

### Effort & risk
- ~Half a day. No key, no cost, no new dependency. Only real edge case: geocoding a vague/missing city → fall back to "weather unavailable" (strip hides gracefully). Optional later: let admin set lat/lon in Settings if the city lookup is wrong.

### Files
- New: `src/app/api/company/weather/route.ts`, `src/lib/weather/wmo.ts`.
- Edit: `src/app/company/calendar/page.tsx` (strip above grid). Optional: store `geo` on business config; add a manual lat/lon override in `src/app/company/settings/page.tsx`.

---

## Feature 2 — Hourly day-planner with drag-to-time + resizable blocks

**Feasibility: FEASIBLE, moderate effort (~1–1.5 days for a polished version).** The drag is already `@dnd-kit`; the new parts are an hourly lane and resize handles. The trick is doing it **without making the main board complex** — so use a day-planner drawer, not an in-place grid morph.

### Recommended UX (foolproof): "drop on day → day-planner drawer"
Morphing the crews×days grid into an inline hourly view is fiddly and easy to get wrong. Instead:
1. On the board, dropping a job on a crew×day cell behaves as today (assigns crew + day, provisional). **Plus**: clicking a scheduled tile's "🕑 Time" (or dropping onto an already-occupied day) opens a **Day Planner drawer** for that crew + day.
2. The drawer is a single vertical hourly timeline (e.g. 6 AM–8 PM, configurable), Google-Calendar style:
   - The job appears as a block. Drag it vertically to set the **start hour** (snaps to 15/30-min).
   - **Resize**: a double-arrow handle appears on hover at the top and bottom edges; drag to change start/end → sets duration. Snap to 15/30-min.
   - Other jobs already scheduled for that crew/day render as context blocks (read-only) so you don't double-book.
3. "Done" writes `scheduledStart` + `scheduledEnd` (full timestamps). "Confirm & notify crew" stays available (reuses the existing `/api/jobs/[id]/assign` branded email, now with a precise time).

Why the drawer: keeps the week board scannable, isolates the precise-time interaction to one focused surface, and is far harder to break than a grid that changes shape mid-drag. "Easy, foolproof" wins.

### Mechanics
- **Drag-to-time:** the block's top offset = minutes-from-day-start × pxPerMin. On pointer drag, update start; clamp to lane bounds; snap (`Math.round(min/15)*15`).
- **Resize handles:** two 8px hit zones (top/bottom). `onPointerDown` captures which edge; `onPointerMove` adjusts start (top) or end (bottom); enforce a 30-min minimum. Cursor `ns-resize`; the double-arrow affordance shows on hover. This is custom pointer math (no extra dependency) — ~80 lines, well-trodden.
- **Snapping + labels:** 15-min grid lines, hour labels down the left. Show the block's start–end time live while dragging.
- **Data:** `Job.scheduledStart`/`scheduledEnd` already exist (added in the epic). Default duration if none: 2 h. The PATCH route already accepts both.

### Board reflects time
- Once a job has a time, its tile on the week board shows the start time (e.g. "8:30a") and sorts within the cell by start. No grid restructuring needed.

### Effort & risk
- Drawer + vertical drag + resize is the bulk. Touch support: `@dnd-kit` PointerSensor covers drag; resize handles need `touch-action: none`. Test on mobile. Optional dependency `@dnd-kit/modifiers` (restrict-to-vertical-axis) makes the drag cleaner but isn't required.

### Files
- Edit: `src/app/company/calendar/page.tsx` (open drawer on day; tiles show time).
- New: `src/components/calendar/DayPlanner.tsx` (hourly lane, draggable+resizable block, snap, save).
- Reuse: `/api/jobs/[jobId]` PATCH (scheduledStart/End), `/api/jobs/[jobId]/assign` (confirm email).

---

## Suggested sequencing
1. **Weather strip first** — small, free, high "wow", zero risk. Ship it standalone.
2. **Day-planner drawer second** — bigger; build behind the existing day-level scheduling so the board keeps working throughout.

## Open questions to confirm before building
- Weather: which location per business — primary `serviceArea` city, or a lat/lon set in Settings? (Default: geocode primary city, allow Settings override.)
- Day-planner: default work-day window (6 AM–8 PM?) and snap granularity (15 or 30 min?).
- Should weather severe-warning days also surface a subtle flag on scheduled jobs that day (e.g. "⚠ storm forecast")? Nice-to-have tie-in.

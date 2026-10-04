# Screen clarity heuristics — "no training needed" (2026-10-04)

The 10 rules every screen is judged against, besides Nielsen's 10 (which stay the base: H1–H10 in
`docs/USABILITY-AUDIT-2026-10-03.md`). Nielsen asks "is it usable?". These ask "is it clear enough that nobody needs
to be taught?". Pass/fail, not taste. Rules 1–8 of `docs/NO-TRAINING-UX-PLAN.md` §2 still apply; this is the short
reviewer's version, with a number to measure where one exists.

TL;DR (ELI5): a screen is a **lab bench**. Only the tools for this one experiment are out. Everything is labelled
with a verb. The next step is the brightest thing on it. Nothing needs a manual.

| # | Rule | Pass test (measure it) |
|---|---|---|
| C1 | **One job per screen.** A screen answers one question ("what do I do now?"). | Say its job in ≤ 8 words. If you need "and", split it or fold the second job. |
| C2 | **One primary action.** One teal button; everything else secondary or ghost. | Exactly one `.button.primary` visible per card/panel. A list of N cards may repeat it, but then the card itself is the target (rule C6). |
| C3 | **Next step is visible, never remembered.** The screen says what comes next and offers it. | Cold user taps the right thing in ≤ 5 s without reading. |
| C4 | **Show less first, more on request.** Progressive disclosure for detail, history, settings. | Above the fold: ≤ 7 interactive elements on a phone. Detail sits behind one disclosure, not two. |
| C5 | **Say it once.** No number, status or line repeated in two places on one screen. | Same fact appears once (tile subtitle repeating tiles, chips repeating the work log = fail). |
| C6 | **One way to do each thing.** No two controls that mean about the same. | Never "Open", "Details" and "More" on one card. Pick one entry point. |
| C7 | **Plain words, user's nouns.** Verbs on buttons; vocab from the industry template; no internal terms, no raw enums. | Zero raw enums/IDs-as-labels, no "provisional/projection/propertyType". Helper lines ≤ 12 words. |
| C8 | **Status is a sentence, state is a colour only for risk.** Green = fine, red = needs you; neutral otherwise. Never warning-orange for a count. | Every colour has one meaning across the app. |
| C9 | **No dead ends, no blanks, no locked doors.** Empty = what goes here + one button. Blocked = tappable with the fix inline. Never hover-only help. | Empty/permission/error state screenshot exists and has one fix button. |
| C10 | **Long lists are searched and bounded, not scrolled.** Newest/likeliest few first, search, "Show all N". | Phone screen ≤ ~3 screen-heights at 30 rows of real data; past that, paginate or collapse. |

Add-ons that decide most reviews:
- **Time-to-first-action** under 1.5 s warm on a phone; **375 px** no horizontal scroll; tap targets ≥ 44 px.
- **Role-aware and industry-aware** (a button that would 403 is a bug; a dental tenant never sees "roof").
- **The Guide is the safety net**, nothing in a workflow depends on reading it.

## How to review a screen (5 minutes)
1. Phone screenshot (375 px) with realistic data (30 jobs, 30 bookings), not the empty seed.
2. Count: primary buttons, interactive elements above the fold, screen heights, repeated facts (C2, C4, C5, C10).
3. Hand it to someone cold: "get a quote sent for this job". Time them; note every hesitation.
4. File findings as one-screen tasks in `TODO.md` — never one giant redesign.

## Status against these rules (2026-10-04, phone, seeded data)
Clean: Dashboard, Calendar, Customers, Library, Team, Field (office/Crew/QR), Job detail tabs, Settings (after T-177/178).
Cluttered, open (filed as T-182–T-185 in `TODO.md`):

| Screen | Phone height | Fails | Why |
|---|---|---|---|
| Pipeline | ~14,500 px | C4, C6, C10 | Past & Cancelled expands every old booking by default (each with Details + More); cards carry both "Details" and "More". |
| Jobs list | ~12,800 px | C2, C6, C10 | Every card has its own primary "Open job" plus a "Details" disclosure; 24+ cards, no paging. Make the whole card the link. |
| Calls | ~11,700 px | C4, C6, C10 | Long unbounded transcript list; Open call / Details overlap. |
| Admin client config | ~16,900 px | C1, C4 | One page edits identity, Vapi/ElevenLabs IDs, branding, rules, phone lines. Superadmin only, so lowest priority; use a sticky section switcher like Settings. |
| Settings, Guide, Demo Studio | 7,000–9,700 px | C4 | Acceptable after T-177/178 (sticky switcher); watch, don't rebuild. |

Heights come from the seeded test data (30+ rows); a real tenant with 5 jobs is shorter, but a busy roofer reaches
this in a month, so the rule is "bounded by design".

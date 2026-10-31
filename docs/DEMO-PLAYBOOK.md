# DEMO-PLAYBOOK.md — how to build a self-led demo that sells an app

How the AIRoof demo at https://crm.luxordev.com/demo was made, written so an agent can apply the same recipe to a different
app. The reference code is `src/components/demo/SelfLedDemo.tsx` (flow and state) and `src/components/demo/DemoStage.tsx`
(screens and animation). The full spec and the owner's decisions are in `docs/SELF-LED-DEMO-PLAN.md`.

## 1. The goal

A stranger opens one link, does almost nothing, and watches **their own business** run inside the app in about a minute.
No salesperson, no signup, no training. The page ends with an easy way to talk to the team.

The owner's rules, which every decision below follows:
- 3 steps, 4 at most. The visitor types one thing.
- Never ask the visitor to do work for you: no codes, no forms beyond the one field, no "click here to continue" chains.
- No filler copy. Every line on screen is either a caption, a label or a button.
- Show the real app's screens, large and easy to read. Personalize with the visitor's own name and business.
- Make conversion one tap: book a call, or "have us reach you".

## 2. The structure (copy this)

| Step | Visitor does | They see |
|---|---|---|
| 1. Start | Types their business name (one optional contact field) and taps **Start my demo** | Their name appears in the app's header straight away |
| 2. The moment | One tap on the core action (here: **Talk to Alice**, a live AI call), or **Just watch** | The app reacting live: captions, then the result landing in the app |
| 3. Autopilot | Nothing. Pause, Back and Next are available | The rest of the workflow, one screen at a time, each with one caption and a spotlight |
| 4. End card | **Book a call with us** or **Have us reach you** | One summary line with a real, measured number |

Always give the step-2 action a **Just watch** alternative. Many people won't talk, record or type in public. The watch
path must reach the same autopilot and end card.

## 3. The stage (the part that sells)

The stage is a large panel that looks like the real app in a browser window:

- **Browser bar** showing the app's real address for each screen (`crm.luxordev.com/company/pipeline`). It makes the demo
  read as "the product", not a slideshow.
- **The app's real menu** down the left, in the app's real order, with the visitor's business name and initial at the
  top. Every menu item is clickable: clicking pauses the tour and shows that screen filled with example data. A
  **Resume demo** button returns to the tour. On a phone the menu becomes one horizontal, scrollable row.
- **The screens** are simplified copies of the real ones: same titles, same labels, same order of information, bigger
  type. Show only what the scene is about.
- **Progress bar** across the top: one segment per step, filling as each scene plays, the current label in bold. The
  core action and its immediate result share one segment (here "Call & booking"), so the bar never looks stuck while
  the visitor is busy.

## 4. Animation style (exact values used)

| Element | Spec |
|---|---|
| Scene length | 5–9 s, longer when there is motion to watch (calendar drag 7 s, field update 9 s). Owner feedback: 1.5 s felt rushed, 3 s was still fast |
| Caption | One sentence, dark pill (`#0b1d24`, white, 19 px bold), centred near the top of the stage, optional teal chip such as "Your office: 1 tap". Static above the app on phones, so it never covers content |
| Spotlight | New item: 4 px accent ring + 14 px soft halo, `scale(1.02)`. Everything else in that scene: `opacity .55`. 0.45 s ease |
| Entrance | `pop`: fade in + rise 12 px over 0.6 s for anything that just appeared |
| Live indicator | Red "LIVE PHONE CALL" pill that turns into a teal "BOOKED" pill. Blinking dot only while live |
| Drag | The card waits in "Unscheduled", lifts (`rotate(-3deg) scale(1.06)` + deep shadow) and glides into its slot over 1.5 s (`cubic-bezier(.5,0,.2,1)`) with a cursor. Then it shows "Confirmed · crew emailed" |
| Voice to data | A phone frame on the left types the spoken words in as they're "said". An arrow ("Straight to the job" → "In the office in 2 s") brightens, then the record on the right fills in line by line with a source stamp ("From the job site · Carlos (foreman) · just now") |
| Toggle | A switch flips by itself halfway through the scene and the document visibly changes (itemized lines → one project price). The visitor can flip it too |
| Clock | One 200 ms interval drives the scripted call, the scenes and the progress bar, so nothing drifts |
| Reduced motion | `prefers-reduced-motion`: all animation off, every scene still readable |

## 5. Copy rules

- Write every visible string into the plan first (a copy deck). Nothing appears that isn't in it.
- Captions sell the benefit, not the feature: "From the job site to the office, instantly. No office trip.", not "Field
  notes are parsed by AI".
- Use the visitor's business name in the headline, the call greeting, the app header, the invoice letterhead and the end
  card.
- The end card's number must be real and meaningful. "Call → lead → booked appointment: 45 seconds" is measured. A
  call-to-invoice time is not meaningful, because real jobs take days.

## 6. Honesty rules (don't skip)

- Label anything that isn't the visitor's own data: "Sample call", "Example prices — you set your own".
- If a step in real life needs a person, say so with a chip ("Your office: 1 tap"). Never imply it happened by itself.
- Prices and numbers come from the app's real starter data (here, the industry's starter price list), not invented.

## 7. Cost and safety guards

- Every live, paid action is capped per visitor and globally. Here: 2 calls × 3 min per demo, 20 demos/day, 300/month,
  3 per network per day. Show the worst-case cost in the plan.
- When a cap is hit, the visitor still gets **Just watch** and a read-only sample app. Never a dead end.
- Each visitor gets a private, expiring sandbox account. Nothing they do can reach real customers or another visitor.
- "Have us reach you" emails the team immediately and keeps that visitor's demo for 7 days for the sales call.

## 8. Reusing this demo, and porting it to a different app

**Other industries in this app (AIRoof).** The live call already works for any industry: one shared ElevenLabs agent
whose prompt and greeting are replaced on every call (`buildTrialPrompt`, `trialConfig`). No new voice account is
needed. What is roofing-only today is the content:
- the trial setup (`roofingTrial.ts` uses the roofing template);
- the "Try saying" line;
- the sample call script;
- the scene screens: roofing job, inspector's quote, chimney field note.

To support another industry, derive those from `VERTICAL_TEMPLATES` and `VERTICAL_PITCH`, as section 5 of the plan
describes. Field-service industries (HVAC, plumbing, cleaning…) reuse the same scenes. Appointment industries (dental,
care homes, daycares) swap the job/quote/invoice scenes for Request → Calendar → Confirmation.

**A different app.** Keep sections 1–7 as they are. Replace:
1. **The moment (step 2).** Use the single most impressive thing the app does live. A voice call only if the app is
   about calls. Otherwise one real action: upload a file, type a request, scan something. If it needs a voice agent,
   one shared agent with per-session prompt overrides serves many tenants.
2. **The scenes.** List the 5–7 screens that tell the workflow from first contact to money or outcome. Give each one
   caption, one spotlight target and one motion: something appears, moves, fills in or flips.
3. **The menu.** Copy the app's real navigation and pre-fill every screen with believable example data.

## 9. Checklist before shipping

- [ ] One required field. The first screen has exactly one primary button.
- [ ] The step-2 action and Just watch both reach the end card.
- [ ] Progress bar, captions and spotlight on every scene. Pause, Back and Next work.
- [ ] Every menu item opens a filled screen, and the main record opens on every tab.
- [ ] Desktop and 375 px phone screenshots read by a person: no overlap, no cut-off captions.
- [ ] Caps are set and the over-limit path still works.
- [ ] Contact request reaches the team inbox.
- [ ] Browser tests for the watch path, the live path and the limit path (here: `e2e/self-led-demo.spec.ts`).

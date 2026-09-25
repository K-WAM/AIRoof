# Demo-day runbook — the 20-minute roofing demo, click by click

Every label below was checked against the code on 2026-09-25. Site: **https://crm.luxordev.com**. Demo line: **+1 (689) 204-2643**.

## A. One-time setup (do once, about 10 minutes)

1. **Upgrade Twilio** (console.twilio.com → the "Upgrade" banner → add a card). Until you do, every caller hears a trial message first.
2. **Set the emergency number.** Log in (see B1) → left menu **Clients** → the **demo-roofing** row → **Edit** → field **Escalation phone** → type your cell → **Save**. (Right now it is a placeholder; an emergency call emails the team an alert that names this number.)
3. **Dry run once, alone**, before any prospect (all of section C–E). Send the quote, report and invoice to **your own** email and check they land in the inbox, not spam.

## B. Five minutes before the prospect arrives

**Screen 1 — Login** (`/login`)
1. Sign in as **connect@luxordev.com** (email + password, or **Google**).

**Screen 2 — Demo Studio** (left menu → **Demo Studio**, or `/hub/demo`)
2. Top card shows the number and "Currently: …". If it says a different company or industry, that is the previous demo — you are about to replace it.
3. Under **1 · Set up the prospect** ("Roofing is selected" — leave it). Fill in: **Company** (their real name, spelled the way it should be *said*), **Owner name**, **Email** (yours, for the dry run; theirs later), **Their business phone** (optional — it is only printed on their quotes and invoices; the AI never calls it, and callers never need it), **City / service area**, and **Logo** (their PNG/JPEG/WebP). The prospect just dials +1 (689) 204-2643 — you never need their number.
4. Click **Launch demo**. Wait ~5–10 seconds. The top card turns green **Ready** and shows the exact greeting a caller will hear (note: the AI reads the recording notice first — that is intentional).
5. Type **your own cell** into "Your own cell, to hear it first" (this is the only place your number is used: **Test call** rings YOU from the demo line) → click **Test call**. Your phone rings: answer, hear the greeting in *their* company's name, say "roof inspection tomorrow at 8", then hang up. If you hear it, you are ready.
6. Open a **second browser window** at `/company/dashboard?preview=demo-roofing` (or click **Open dashboard**). Keep it beside the first.

## C. The demo (20 minutes)

**0–2 min — hand them the number.** "Call this. It's your receptionist." Read them **+1 (689) 204-2643**.

**2–6 min — they call.** Suggested lines: "Do you do tile roofs? Do you work with insurance claims?" → something off-topic ("what's the weather?") → then book: "I have cracked tiles on the south slope. Can someone come tomorrow morning? Name…, address…". It answers as their company, redirects the off-topic question, and books.
*If it fails:* call it yourself on speaker.

**Screen 3 — Calls** (window 2: left menu **Calls**)
- While they are still talking a row appears with a **Live** badge (the page checks every 10 s).
- After they hang up (10–30 s): the row shows **Ended**; click it → you see the **summary**, the **transcript** and a **recording player**.

**6–9 min — from call to job (one tap)**

**Screen 4 — Pipeline** (left menu **Pipeline** → the **Appointments** tab)
- Their booking is at the top, with the caller's name, address and the problem.
- Click **Review request** → the dialog shows summary, transcript, recording. Tick nothing → click **Confirm & create Job**.
- You land on the new job: customer, email, address and reason already filled in; the header says "From call · <time> · View transcript".
*If it fails:* open the seeded job **J-1001** (`/company/jobs/J-1001?preview=demo-roofing`) — it already has everything.

**9–13 min — the field**

**Screen 5 — the job page** (Jobs → the job). Under the title you see the guide bar: ① Findings → ② Quote → ③ Work → ④ Report → ⑤ Invoice, with a **Next:** button.
- Click **Field QR** → a code appears (valid **10 minutes**, works once; if it expires press **New code**).

**Screen 6 — the technician's phone**
- Scan the code with the phone camera → tap the link. First time: allow the microphone. Header reads **Luxor Field**.
- Type a name in **Your name (optional)** ("Marco"). The job is already selected.
- Tap **Arrived at job**.
- Hold the big **mic**, speak, release: "This is Marco. Six cracked tiles on the south slope, and the pipe boot over the kitchen is split." Status text goes Uploading → Transcribing → Updating the job (5–10 s), then "✓ Logged".
- Tap **＋ Photo** → take a picture → type a description (required) → **Save photo**.
- Tap **＋ Finding** → tap **Cracked tiles** (or any item) → it says "Finding added".
- (Optional Spanish: hold the mic and say it in Spanish — the office sees the English.)

**Back on the laptop — the job page updates by itself** (about every 5 s; no reload)
- **Timeline** tab: the new **Job history** panel at the top (call → job → arrival → update → photo → finding), then the field notes.
- **Findings** tab: the tab label says "· N suggested" — open it: "From the field notes" lists Library matches → click **＋ Add** on each.

**13–16 min — the quote**
- Click **Next: Quote** (or the **Quote** tab). It is **already drafted** from the findings: cards of *Issue → Work → Price*, with a big **Estimated total**.
- Click **＋ Add item** → search "flashing" → click **Damaged flashing** → its work and default price appear. Click into the price and change it — the total updates.
- Optionally open **What the customer sees** and switch on **Hide materials** — it explains itself.
- Type the customer's email in the box at the bottom → **Send quote** (it saves first). Status changes to **Sent**.
*Show the email arriving on your phone/laptop.*

**16–18 min — report and invoice**
- On the phone tap **✔ Work complete** twice ("Tap again to mark this job complete").
- Laptop: **Report** tab → it opens **already generated and drafted** (photos, findings, no prices) → **Mail report** → email → **Send report**.
- **Invoice** tab → **Generate Invoice** → **Send to Customer** → email → **Send Invoice**.

**18–20 min — the story and the close**
- Back on **Timeline**: read the **Job history** top to bottom — that is the whole job, automatically.
- Close: "Keep your number. Forward calls to ours. Live in about 48 hours." (The guide bar now shows every step ticked.)

## D. Extras if there is time
- **Emergency:** call and say "water is coming through my ceiling" → the AI escalates; an alert email arrives at the email you launched with.
- **Spanish:** call and speak Spanish — it switches by itself.
- **Customers** (left menu) → the caller is already there. **Calendar** → drag the job onto a crew.

## E. After every demo
- **Demo Studio** → scroll to **3 · Reset** → **Reset demo** → type **RESET** → **Confirm reset**. This wipes the calls, jobs, customers, quotes, photos and booking slots and re-seeds J-1001. Do it before the next prospect (and after your dry run).

## F. Things to expect (so nothing surprises you)
- The AI says the **recording notice** before the greeting. Normal (compliance default).
- The demo line always sounds **open** (every launch sets round-the-clock hours), so a 7 pm caller never hears "the office is closed".
- **Twilio trial** = a trial message before the AI answers. Fix in A1.
- If ElevenLabs ever can't reach the app, the line falls back to the agent's own greeting ("Carlita Roofing") — if you hear that name, check https://crm.luxordev.com/api/health.
- Voice takes 5–10 s to appear in the job. Say "it's processing" — don't tap again.
- Emails come from **Luxor CRM <crm@luxordev.com>** under the business name, replies go to the business email. Not yet verified for spam placement (NH-25) — always test to your own inbox first.
- Nothing has been run end-to-end on a real phone by anyone yet. Your dry run in A3 is the first.

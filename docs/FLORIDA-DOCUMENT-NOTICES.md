# Florida document notices & terms — DRAFT — not legal advice — attorney must review

> **DRAFT — not legal advice — attorney must review.**
> This file is a first draft of the wording a Florida-licensed construction attorney must review before any
> of it reaches a customer. It was written by a non-lawyer from the task brief; every statutory citation
> and every quoted statutory snippet below is marked
> **"verify verbatim against the current Florida Statutes"**. The author did **not** read a verified copy of
> the statutes while drafting, and nothing here should be treated as the exact statutory language or as a
> statement that a notice is legally sufficient.
>
> **Three gates sit between this draft and any customer document** (`docs/DEMO-FEEDBACK-PLAN.md`):
> 1. the integrator's review, 2. the attorney's review, and 3. the app's own "I have had these reviewed"
> approval flag. **Nothing renders on any quote or invoice until that approval flag is set** (E5). Statutory
> notices render only for residential jobs over the dollar threshold (default `$2,500`) and never for jobs
> marked Commercial property.
>
> **Owner action (NEEDS-HUMAN):** have an attorney review this file, edit the wording in
> Settings → Documents, then tick "reviewed". The default wording in code lives in
> `src/lib/documents/legalNotices.ts`; this memo is its source.

## How to read the tables

- **Applies to** — the document(s) the wording belongs on: `quote` (the offer/contract before work) and/or
  `invoice` (after work). The brief asks for this per notice; a Florida attorney should confirm it.
- **Trigger** — the conditions that must be true before the notice renders. For the statutory notices the
  brief's defaults are *residential AND total over `$2,500`*; the exact trigger and threshold must be
  verified.
- **Draft wording** — illustrative only. It uses the placeholders `{businessName}` and `{licenseNumber}`.

---

## A. Statutory notices

### A1. Construction Lien Law notice

- **What it is.** The notice Florida's Construction Lien Law requires around a direct contract with the
  owner, warning the owner about lien rights and how to protect against a lien.
- **Statute.** `§ 713.015, Fla. Stat.` — **verify verbatim against the current Florida Statutes.** (Related:
  the Notice to Owner under `§ 713.06`; the brief names `§713.015`, and the attorney must confirm the exact
  section, form and required content.)
- **When it applies.** Generally a **direct contract with the owner**; the brief's default threshold is a
  **residential** job over `$2,500`. **Verify** the current thresholds and whether this notice is required
  before the contract is signed.
- **Which document.** Quote/contract (before or at signing), not the invoice.
- **Draft wording (DRAFT — verify verbatim against the current Florida Statutes):**
  > "FLORIDA LAW REQUIRES THAT WE GIVE YOU THIS NOTICE ABOUT YOUR RIGHTS UNDER THE CONSTRUCTION LIEN LAW
  > BEFORE WE BEGIN WORK. THIS IS A DRAFT NOTICE AND MUST BE REPLACED WITH THE CURRENT STATUTORY WORDING."

### A2. Homeowners' Construction Recovery Fund notice

- **What it is.** The notice to a homeowner about the Homeowners' Construction Recovery Fund.
- **Statute.** `§ 489.1425, Fla. Stat.` — **verify verbatim against the current Florida Statutes.**
- **When it applies.** The brief's default is a **residential** job over `$2,500` with a direct contract with
  the owner. **Verify** the current threshold (the brief uses `$2,500`) and any exceptions.
- **Which document.** Quote/contract.
- **Draft wording (DRAFT — verify verbatim against the current Florida Statutes):**
  > "IF YOUR CONTRACTOR FAILS TO PERFORM, YOU MAY HAVE A CLAIM AGAINST THE HOMEOWNERS' CONSTRUCTION
  > RECOVERY FUND. THIS IS A DRAFT NOTICE AND MUST BE REPLACED WITH THE CURRENT STATUTORY WORDING."

### A3. Construction-defect notice (opportunity to repair / cure)

- **What it is.** The written notice under Florida's construction-defect statute giving the other party
  notice of a claimed defect and an opportunity to inspect and repair before a claim proceeds.
- **Statute.** `§ 558.005, Fla. Stat.` — **verify verbatim against the current Florida Statutes.**
- **When it applies.** To construction-defect claims; the brief asks for a default notice on the contract/
  offer. **Verify** whether it belongs in the offer, the contract, or only when a defect is asserted, and
  any notice-period specifics.
- **Which document.** Quote/contract (and possibly later work authorizations).
- **Draft wording (DRAFT — verify verbatim against the current Florida Statutes):**
  > "NOTICE OF CONSTRUCTION DEFECT AND OPPORTUNITY TO REPAIR: [DRAFT — the parties must give notice and an
  > opportunity to inspect and repair as required by Florida law. Verify the current statutory wording and
  > required time periods.]"

### A4. License number on offers and contracts

- **What it is.** The requirement that the contractor's license number appear on offers to perform.
- **Statute.** `§ 489.119(5)(b), Fla. Stat.` — **verify verbatim against the current Florida Statutes.**
- **When it applies.** Whenever an offer is made. **Verify** the exact display requirement.
- **Which document.** Quote/contract.
- **How the app satisfies it.** This is **not** a toggleable notice; the license number is rendered through
  the shared **letterhead/footer** ("License #{n}") from `BusinessConfig.licenseNumber` (E5). The owner must
  fill in the license number in Company Settings. If the number is missing, the offer must not be sent.
- **Draft wording.** None as a standalone notice (see the letterhead requirement above).

### A5. Deposit and payment rules

- **What it is.** Statutory limits on deposits/advances a contractor may collect before beginning work.
- **Statute.** `§ 489.126, Fla. Stat.` — **verify verbatim against the current Florida Statutes.**
- **When it applies.** Residential transactions. **Verify** the current deposit caps and permitted uses.
- **Which document.** Quote/contract payment terms; the invoice once billed.
- **How the app captures it.** There is no separate deposit notice id in
  `src/lib/documents/legalNotices.ts` (the brief's fixed id list omits one). The requirement is covered by
  the **payment-terms** default (B6). The attorney should confirm whether a dedicated deposit notice is
  also required; if so, the integrator can add a tenth default.

---

## B. General quote / invoice terms

These are the six editable defaults in `src/lib/documents/legalNotices.ts` that match the brief's id list
(plus the two memo-only items at the end). None is a statutory quote, but each should still be reviewed.

### B1. `quote-validity` — Quote validity

- **What it is.** How long the quoted pricing stays open.
- **Statute.** None.
- **Applies to.** Quote.
- **Draft wording:**
  > "This quote is valid for 30 days from the date above. After that, pricing may change and the work may
  > need to be re-inspected."

### B2. `hidden-damage` — Concealed / hidden damage and change orders

- **What it is.** That undiscovered damage or changed scope is handled by a written change order before the
  extra work is done, and may be billed at stated unit prices.
- **Statute.** None (contract term).
- **Applies to.** Quote and invoice.
- **Draft wording:**
  > "This quote covers the work described above. If we find concealed or additional damage once work begins,
  > we will stop, explain it, and give you a written change order to approve before doing the extra work.
  > Added work is billed at our stated unit prices."

### B3. `price-escalation` — Material price increases

- **What it is.** That material prices can move (especially after a storm) and how that is handled.
- **Statute.** None (contract term).
- **Applies to.** Quote.
- **Draft wording:**
  > "Material prices can change without notice, especially after a storm. If a material price rises before
  > your work is scheduled or before materials are ordered, we will tell you and confirm the change with you
  > before proceeding."

### B4. `permits` — Permit and inspection fees

- **What it is.** Whether permit and inspection fees are included or passed through.
- **Statute.** None (contract term).
- **Applies to.** Quote and invoice.
- **Draft wording:**
  > "Permit and inspection fees are not included in this price unless stated above. If a permit is required,
  > the fee is passed through at cost with the municipality's receipt. We will confirm before pulling it."

### B5. `weather-delays` — Weather and hurricane-season delays

- **What it is.** That weather can shift the schedule, including during hurricane season.
- **Statute.** None (contract term, but a hurricane/force-majeure review is worthwhile).
- **Applies to.** Quote.
- **Draft wording:**
  > "Outdoor work depends on the weather. Rain, storms, or hurricane-season conditions may delay the start or
  > completion of the work. We will reschedule as soon as it is safe and keep you informed."

### B6. `payment-terms` — Payment, deposits and late payment

- **What it is.** Deposit, due date, accepted methods, and late-payment terms. Also the home of the
  `§ 489.126` deposit consideration (A5).
- **Statute.** `§ 489.126, Fla. Stat.` — **verify verbatim against the current Florida Statutes** for any
  deposit cap before relying on this wording.
- **Applies to.** Quote and invoice.
- **Draft wording:**
  > "Payment is due upon completion unless a deposit is agreed in writing above. A deposit, if any, may not
  > exceed the amount allowed by Florida law. Late payments may be subject to a late charge. [DRAFT —
  > attorney to confirm the deposit cap, due terms and late-charge wording.]"

### B7. Memo-only: Workmanship warranty placeholder

- **What it is.** A placeholder describing any workmanship warranty and its length.
- **Statute.** None.
- **Applies to.** Quote and invoice.
- **Status.** The brief lists this as a general term, but it has **no id in the fixed
  `FLORIDA_NOTICE_DEFAULTS` list**. Suggested wording to be added (by the integrator/attorney) as a tenth
  default, or handled as a Settings field:
  > "We warrant our workmanship for [length] from completion. This warranty does not cover damage from
  > storms, misuse, or work performed by others. [DRAFT — attorney to confirm.]"

### B8. Memo-only: Thank-you / closing line

- Not legal wording, but the owner wants it on the invoice (E5, matching the reference invoice). No notice
  entry is needed; kept here so the attorney sees the full customer-facing text in one place.

---

## C. Mapping to `src/lib/documents/legalNotices.ts`

The code holds the **DRAFT** wording for the nine editable defaults below. `statutory: true` defaults also
carry `thresholdUsd: 2500`. Nothing renders until the E5 approval flag is set.

| id | statutory | thresholdUsd | appliesTo |
|---|---|---|---|
| `fl-lien-713` | yes | 2500 | `["quote"]` |
| `fl-recovery-fund-489` | yes | 2500 | `["quote"]` |
| `fl-defect-558` | yes | 2500 | `["quote"]` |
| `quote-validity` | no | — | `["quote"]` |
| `hidden-damage` | no | — | `["quote", "invoice"]` |
| `price-escalation` | no | — | `["quote"]` |
| `permits` | no | — | `["quote", "invoice"]` |
| `weather-delays` | no | — | `["quote"]` |
| `payment-terms` | no | — | `["quote", "invoice"]` |

> **Reminder:** all of the above is a DRAFT, not legal advice. Every statutory citation and quoted snippet
> must be **verified verbatim against the current Florida Statutes** by a Florida-licensed construction
> attorney before use.

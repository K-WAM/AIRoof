# Roof Doctors money worktree review

Status: WIP. Do not merge as finished.

- T-335: Imported invoice totals now retain amount plus tax, with balances clamped to the invoice total; paid, partial, unpaid and void cases covered. The finance page explains imported invoices use issue date plus 30 days.
- T-336: Cards, aging, customer filters, chips and row navigation are implemented. The API now retains matched customer IDs. Focused finance and company split tests passed desktop and phone before the final cosmetic fix; link and filter combinations need further coverage.
- T-337: Always-visible dates, a preliminary accordion, and an example are implemented. Screenshot review found the phone row lacks labels, the example is only a single summary instead of day-by-day punches, and overtime detail needs review. Not ready.
- T-338: Default and other company branding is separated in the shell, with the Luxor mark. Screenshots use seeded placeholder logos; real SVG and PNG rendering and the final phone layout need verification.
- T-339: Feedback is pinned in the desktop footer and disabled for View as. Owner, staff, field crew and superadmin Preview opened feedback on desktop and phone; View as still needs a browser check.

Validation: finance unit tests 27 passed; related Vitest 43 passed across 5 files (before the final shell placement); TypeScript passed before the final shell placement; changed-file ESLint had no errors and one existing unused Link warning in layout. Focused finance/company split: 4 passed across desktop and phone. Preview pages, Roof Doctors screens and finance: 27 passed in the larger run. Desktop screen audit passed all 16 screens. Phone screen audit failed Settings height (5620px against 5500px); its retry was interrupted after reproducing the height. Payroll example interaction: 2 passed after correcting a test selector. Feedback checks: 8 passed across desktop/phone, plus the 1440 header check passed; one phone 1440 check skipped.

Screenshots inspected: finance at 1280 and 375, header at 1440, payroll example at 1280 and 375. The phone payroll layout needs work as described above. Screenshots use seeded data, not real client logos or 30 invoices.

The local call-to-cash scenario failed at the post-call webhook with HTTP 404 (0/1 steps), so the audit lacked its usual complete call-generated data. The harness was stopped. It does not cover real phone audio, real inbox delivery, or next build. No production writes, push, merge, or dependency installation were performed.

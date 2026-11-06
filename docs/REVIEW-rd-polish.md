# Roof Doctors polish review

Worktree: D:/Apps/air-wt-rd-polish; branch: task/rd-polish. Local commits only; no push, merge or deployment. No production data, provider calls, new dependencies, CSP changes, or booking-engine changes. app-status.json is unchanged because this work does not change its facts.

## T-330 - Calendar progress

Reviewed the supplied state helpers and board. Completed work remains visible and locked; blue/amber/green have text labels, unconfirmed work remains dashed, and inspection/crew focus is remembered. Fixed completed phone cards opening reschedule and the phone inspection link opening Pipeline instead of its linked job. Combined guide bullets to meet the four-bullet limit. Fixed overlapping test fixtures and removed a conditional assertion that could silently skip the phone state check.

Files: calendar/CalendarBoard.tsx; lib/calendar/itemState.ts and tests; company/guide/guideContent.ts; e2e/calendar-status.spec.ts.

Evidence: calendar-status 2/2 desktop/phone after fixture correction. Existing calendar-smooth, crews-calendar, hints and guide passed in the initial targeted batch. Read calendar-status-week, calendar-status-phone and existing time-picker/reschedule screenshots. Commit 833af7d.

## T-331 - Classic letterhead

Reviewed and completed classic document previews, print copies and email blocks, the owner/platform Branding picker, company fax/website/tagline fields, isolated non-default letterheads, trade-specific copy and deposit metadata. Fixed the missing state-license line in classic proposal/T&M emails; refreshed legacy copy even when the company is unchanged; stopped failed settings loads from pretending Standard was selected; made the classic item table fit 375px instead of clipping prices.

Files: lib/documents/*; lib/billing/job*EmailHtml.ts; lib/companies/{documentCopy,documentLetterhead,validation}.ts and tests; types/{index,company}.ts; verticals/templates.ts; company Library/DocumentStyleSection; CompanyProfiles; job page and DepositInvoices; company settings and job company/invoice/send routes; e2e/documents-classic.spec.ts.

Evidence: classic scenario 2/2 desktop/phone, including plain quote, proposal, T&M, inspection and repair completion, photos, invoice, deposit, RCU license/no business website, captured quote/invoice email, Branding radio persistence, and finally restoring Standard. Used the fixture's allowed recipient; did not change the evaluation guard. Nine new document-style API permission/validation tests passed. Read classic-invoice-print at both sizes (including the corrected price columns), proposal/T&M, completion, RCU invoice and Branding screenshots. Commit 6641886.

## T-332 - Findings and quote

Finding cards show their saved quote amounts by findingId and link to the one price editor. Quote line inputs have desktop column labels. Finding inclusion changes refresh quote data.

Files: FindingsPanel.tsx, QuotePanel.tsx, job page, globals.css, e2e/findings-price.spec.ts.

Evidence: findings-price 2/2 desktop/phone; changed a line price from 100 to 125 and confirmed the saved amount back on the finding. Read both findings-quote-price screenshots. Commit 3acbc3e.

## T-333 - Provision-login security

Refuse platform accounts/claims, accounts belonging to another tenant and unlinked Auth accounts. Existing same-business accounts require an explicit confirmed reset; reset changes only the password, retaining tenant, role, activation and creation date. Only auth/user-not-found permits creation. Provider failures fail closed, are not logged/echoed, and never trigger fallback creation. Temporary passwords use cryptographic randomness and no-store responses. Success returns only tempPassword. The separate Reset password button uses the shared Modal; changing the email clears displayed credentials. The warning explicitly says to use the client's own email.

Files: admin provision-login route and route.test.ts; admin config page; e2e/admin-config.spec.ts.

Evidence: related security tests 24/24; security browser scenario 2/2 desktop/phone. Read both client-login screenshots and a full-size phone crop; improved warning contrast. Commit a139303.

## T-334 - Admin configuration

ElevenLabs agent/phone fields appear first; missing provider is labeled explicitly and remains missing on unrelated saves. Vapi IDs, language overrides and callback controls are folded into Legacy Vapi settings when stored. Mock calendar choice is hidden unless a non-mock value is stored. Logo URL editing is replaced by the current library logo and a direct Branding link, preserving the URL. Business phone (setup) is labeled by its setup-fallback use; Phone on documents describes the public contact phone's purpose.

Added the existing View as menu in the header and a validated Standard/Classic Document look select. Generate invoice now creates a saved draft, prefills client contact/address and the plan description/price/terms, and opens that exact LX invoice. It never sends it. The linked invoice editor now fits 375px, keeps currency values together and allows wrapped line descriptions. Updated Playbook labels.

Files: admin business config page and config API/tests; admin invoices page; hub guide; e2e/admin-config.spec.ts.

Evidence: tsc passed, changed-file eslint had no errors, 31 related unit tests passed. Config scenario passed desktop and phone after correcting the invoice layout, including preserving absent/legacy values, saving document look, editing/saving the generated invoice without any email, and View as read-only. Security scenario also passed both sizes after resumption. Read the corrected phone invoice, Branding, login-card and desktop screenshots. Commit 47020ea.

Clutter hidden/replaced: Vapi IDs/voices/callbacks folded; mock calendar select hidden; Logo URL editor replaced. Main phone was relabeled, not removed. No stored setting was deleted.

## T-329 - Job loading speed

Deferred Quote, Findings, deposits, report controls/rendering, document controls, the photo editor and private-demo documents. Standard, classic and typed-letter presentation use separate browser chunks. Library sections are deferred. Pure server/static-markup document rendering is retained. Refreshing cached settings after a Branding choice makes the next opened document honor it immediately.

Files: job page, QuotePanel, DepositInvoices, extracted ReportDocument; Library and DocumentStyleSection; PanelSkeleton; DocumentPreview, StandardDocument, LazyDocumentPreview, QuoteLetterPreview and ClassicQuoteLetter; e2e/job-lazy.spec.ts and classic scenario.

| Build measurement | Before | After |
|---|---:|---:|
| Job route JS | 72.5 kB | 48.1 kB |
| Job first load JS | 211 kB | 185 kB |
| Library route JS | 20.5 kB | 8.16 kB |
| Library first load JS | 153 kB | 137 kB |

These are measured production-build sizes, not claims about network latency. Job route JS decreased 34%; it remains the heaviest company route. The supplied pre-polish baseline was 72.3/210 kB; the directly comparable local pre-split build was 72.5/211 kB. Both builds passed. tsconfig.json was backed up/restored exactly and .next-measure removed after each.

Evidence: tsc passed; eslint had no new warnings (two pre-existing image warnings remain); 30 related renderer tests passed. Job-lazy 2/2 passed on desktop/phone: inactive named panels were absent from first-paint script requests; selecting Findings loaded a new chunk and showed a skeleton; inactive Library sections stayed deferred. Classic scenarios passed both projects, including opening documents immediately after each Branding radio choice. Read both loading and ready screenshots and classic documents. Commit a2c1237.

## T-342 - Finding categories

Group findings under a category once, then a numbered list with Problem, Corrective Action and inspector notes. Category order follows first appearance; finding order is preserved within each category. Blank/absent categories use Findings. Both React document styles and emailed HTML share the grouping rule. Explicit compact-layout preferences are retained. No stored findings are changed.

Files: lib/documents/findingGroups.ts, FindingSections.tsx, StandardDocument, ClassicDocument, DocumentPreview, emailBlocks and findingSections tests; billing/jobQuoteEmailHtml; e2e/documents-roofing.spec.ts.

Evidence so far: related run 433 passed with one unrelated cold-import timeout in the deposit lock test; isolated retry passed all 10 deposit tests. Grouping tests passed 10/10 after typed-test corrections; tsc and changed-file eslint passed. Browser and final regression evidence pending.

## Test runs

- Initial tsc: passed. Initial changed-file eslint: 0 errors, two pre-existing job-page image warnings.
- Initial related Vitest: 144 files passed, one failed; 1457 passed, one expected failure, one guide-bullet failure. The guide failure was fixed; focused guide/style rerun: 21/21.
- Focused calendar/legacy-copy run: 16/16. Document-style API permission/validation: 9/9.
- Initial requested browser batch: 58 passed, 3 skipped, 1 flaky (proposal test's transient updates-route 404 passed retry), 2 failed (calendar fixtures overlapped). Corrected calendar scenario subsequently passed both projects.
- New test development exposed selector errors (print twin, tab role and document-company payload) and the fixture recipient allowlist; all were corrected. Classic and findings scenarios subsequently passed as recorded above.
- Admin config related tests after document-look validation: 31/31 across 2 files.
- Final call scenario, screen audit, full browser suite and harness shutdown: pending.

## Navigation and prefill

- Generate invoice opens the saved draft in one action with known client name, contact, address, monthly description/price and terms filled. It removes blank line entry and a separate draft-save step.
- Library logo opens the client's Branding section directly. Header View as avoids returning to Clients and finding the row again.
- Finding prices open Quote directly; linked inspection bookings open their job. Existing form values and role restrictions are retained through the lazy splits.
- Category grouping removes repeated headings and shortens documents without another click or hiding a finding. No stored data was removed.

## Screenshots

Read directly from test-results/screens and retained under .e2e/review-screens before later Playwright runs wiped the output. These are local, ignored test fixtures, not client data. Final screenshots and review details will be recorded here.

## Limits and noticed items

The harness captures email rather than delivering to a real inbox. It does not prove real phone audio, ElevenLabs/Twilio behavior, inbox placement, real AI parsing/transcription, Google sign-in, or production quotas/indexes. No production verification was attempted because it was explicitly forbidden.

An existing company-switch screenshot showed the draft's thank-you textarea retaining the previous company while the customer preview resolved the current company correctly. This predates the classic preview branch; no unrelated editor rewrite was made. Custom wording remains protected from automatic rewriting.

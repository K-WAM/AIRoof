# Roof Doctors money worktree review

Status: all assigned implementation is ready for review. Final task commits use normal T-xxx titles; the earlier WIP commits were kept and nothing was amended in this continuation. No push, merge, deployment or production access occurred.

## Per task

| Task | Final result | Commit |
|---|---|---|
| T-335 | Imported totals remain amount plus tax; payments affect collected/balance. Voids stay excluded. Imported due dates are explained as issue date plus 30 days because the invoice export has no per-invoice term. | 48730b2 |
| T-336 | Card + aging + customer filters combine independently. Toggle-off, chips, owing-row toggle and Clear all are covered. Customer, imported invoice and app job links reach loaded records; whole-row Space works. The missing customer record route now reuses the existing customer screen and focuses that record, with an All customers return link. Preview context is retained. Five invoices per page keeps the phone list bounded. | 1ef3f5b |
| T-337 | The local-only example has two invented people and Mon-Sun rows, in/out punches, jobs and hours. The existing weekly calculation gives 40 regular + 2 overtime for one person and 38 regular + 0 overtime for the other. Person summaries label every value. Dates remain visible and changing one selects Custom. | dc1d278 |
| T-338 | Invented SVG and detailed 1000px PNG artwork were uploaded through the logo-library API and assigned through the company API. Natural sizing avoids pixel upscaling. Two phone brands get their own row; the Luxor mark is smaller. Desktop 1280/1440 and phone 375 screenshots were read. | 32b90c9 |
| T-339 | View as retains Feedback disabled with a readable note; the desktop note wraps instead of clipping. Owner/staff/crew/Preview feedback opening, View as write refusal, Exit and field landing were checked on desktop and phone. Guards were not weakened. | 41ffe22 |
| T-340 | Importer supplies missing list/search/identity fields. The new backfill is dry-run by default, rejects demo/unknown targets, requires matching apply confirmation, rechecks missing fields in transactions of at most 400 writes and never overwrites existing fields. Local repair changed 191 records, then zero. All 191 imported customer IDs are returned by the real list API and searchable in the UI. | 9962ef4 |
| T-341 | Metadata-only mapping covers all 44 CSV files. Optional --setup adds clear-home data to existing crews, pricing, invoice preferences and finding categories. All 3,560 source rows, including repeats, are retained with file/row number. Repeat import left projected setup content unchanged and Auth users at 16. No accounts, invites, messages, live jobs or new setup screens are created. | This commit |

## Validation and evidence

- TypeScript: npx tsc --noEmit passed. Changed-file ESLint (including scripts with --no-ignore) passed with no errors or new warnings.
- Related Vitest: 395 tests across 38 files were covered. One existing send-lock test timed out during the concurrent browser run; its isolated file retry passed all 10 tests without a code or timeout change. The two new imported-term tests also passed: 397 distinct related tests covered in total. The final setup derivation tests passed again after the source-row preservation change.
- Focused screen run: 25 passed, 1 skipped across desktop/phone. The skip is the duplicate phone instance of a desktop-only 1440 screenshot.
- Additional final run: 14 passed across desktop/phone (company-split, import screens, header/View as, and existing View as flows).
- Screen audit now includes customer record, Finances and Payroll. Desktop passed all 19 screens. Phone passed 18/19 screens; the only failure is the already-recorded Settings height, 5,620px versus 5,500px. No threshold was weakened. No first-content, API-count or overflow failures were reported.

| New audit screen | Phone first content | API calls | Phone height |
|---|---:|---:|---:|
| Customer record | 1,034ms | 4 | 1,054px |
| Finances | 904ms | 2 | 2,042px |
| Payroll | 1,113ms | 2 | 994px |

The verification story is Customers/Library -> tenant-guarded APIs -> emulator Firestore -> rendered imported records. The API test checks every imported customer ID, not merely an empty/error screen. Setup UI checks cover crews, all three hourly labor rates, six preserved term choices and the finding-category selector. Source categories without standard fixes do not fabricate repair instructions.

## Earlier post-call 404

A throwaway detached worktree of main at 1b7aed9 was created with a node_modules junction. Its local call-to-cash run passed 12/12; this branch's fresh harness also passed 12/12. The post-call route is unchanged from that base. The earlier 404 was not reproduced after a fresh local harness start; the exact historical dev-server state cannot be proven from the retained evidence, so no webhook/booking change was made. The throwaway harness was stopped, its junction unlinked and the worktree removed. Local receipts are .e2e/main-call-verification.log and .e2e/call-verification.log.

## Screenshots read

Read desktop 1280/1440 and phone 375 brand artwork, phone/desktop payroll example, finance list, disabled View as feedback, imported Customers, Library crews/labor rates, payment terms and finding-category screenshots. Phone labor evidence includes a continued viewport capture so all three rates can be read. Also read the new phone customer-record/finance/payroll audit screenshots.

Evidence is retained locally in .e2e/review-screens/{desktop,phone}/ and test-results/screens/{desktop,phone}/. These screenshots may show imported client data and are intentionally not committed. The mapping document and tests contain no client values.

## What was shortened

- Finance cards and aging bars filter directly; chips and Clear all avoid reopening the filter form.
- Customer names and invoice rows go straight to the relevant record. Customer record links show the record first instead of making a phone user scroll through the list.
- Payroll person names open one inline timesheet. Date changes fill the Custom period state automatically.
- Existing Library sections and the existing Payment due control are reused. Known source due-day choices are available without a duplicate setup screen. Finding categories use the existing picker.
- Imported customer activity/search fields are filled automatically; the owner does not have to recreate the spreadsheet's customers manually.

## Owner decisions / findings

1. Choose the default due days for new invoices from the six source terms. The existing default is retained; source deposit/discount rules are preserved but are not applied automatically. Historic imported invoice due dates remain the documented 30-day fallback, not a claim that each old invoice had that term.
2. Review material unit conflicts: existing units/prices are preserved, and importedUnit retains the source unit. The two material exports share 194 rows / 191 names and identical prices; differing category/type/description metadata is preserved in the source archive.
3. One invoice has no matched customer and needs owner matching. No identity was guessed.
4. Supply standard repair solutions if the 115 taxonomy labels should become selectable standard fixes. Only category definitions were provided; solutions were not invented.
5. Decide mappings/homes for contacts without a customer key, deals, service orders, safety checklists, workflow statuses, maintenance and warranties. See docs/clients/JOBBA-SETUP-MAPPING.md. Crew membership is linked only with an exported person row and a unique existing account; no login or invite is created.
6. The broad phone Settings height finding remains for the integrator; it is unchanged from the previous report.

## Main files

- Finance/customer navigation: src/app/company/finances/page.tsx, src/lib/finance/summary.ts, src/app/company/customers/CustomersScreen.tsx, customers.module.css and [customerId]/page.tsx.
- Payroll: src/app/company/payroll/page.tsx, src/lib/payroll/timesheet.ts and preview.module.css.
- Shell: CompanyBrand/layout from the earlier implementation, plus globals.css and company-nav.tsx.
- Import/repair: scripts/import-jobba.mjs, scripts/backfill-customer-list-fields.mjs, scripts/lib/customer-list-fields.mjs, scripts/lib/jobba-setup.mjs. The duplicate inline token builder was replaced by the shared field helper; no feature was removed.
- Setup rendering/contracts: GettingPaidPanel, customerPayments, FindingPickerSheet, the guarded findings GET response, and optional library/work-catalog/billing preference fields.
- Tests: finance/payroll/import helper tests; imported-term tests; rd-money, header, payroll/feedback, jobba-import, view-as and screen-audit specs.

The local harness cannot verify real phone audio, actual inbox delivery or next build. No production verification is claimed. The harness is stopped at handoff.

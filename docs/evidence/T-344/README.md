# T-344 review evidence

All images use invented local smoke-harness tenants and accounts. No client export was loaded. Phone viewports are 375 CSS pixels (2x pixel density); desktop viewports are 1280 pixels. Before images use the menu components from 71394cd; after images use this task's working source. The before capture waited for industry bootstrap, including dental's Patients vocabulary and disabled Jobs/Field/Billing.

| Account | Desktop before / after | Phone before / after |
|---|---|---|
| Roofing owner | [Before](before-proOwner-1280.png) / [After](after-proOwner-1280.png) | [Before](before-proOwner-375.png) / [After](after-proOwner-375.png) |
| Crew | [Before](before-fieldCrew-1280.png) / [After](after-fieldCrew-1280.png) | [Before](before-fieldCrew-375.png) / [After](after-fieldCrew-375.png) |
| Dental owner | [Before](before-dentalOwner-1280.png) / [After](after-dentalOwner-1280.png) | [Before](before-dentalOwner-375.png) / [After](after-dentalOwner-375.png) |

The roofing office menu has nine destinations instead of fifteen. All nine are visible in the initial phone menu view. Crew keeps Field and Help. Dental keeps Patients and has no Jobs, Field or Finances item.

Existing screens keep their original URLs:

- /company/dashboard
- /company/pipeline (Requests) and /company/calls
- /company/calendar
- /company/jobs and /company/field
- /company/billing (Invoices), /company/finances and /company/payroll
- /company/customers and /company/library
- /company/settings and /company/team
- /company/guide (Help, with Guide and Send feedback)

The original MODULE_ROUTES and showcase gates still protect these URLs. Each top switch independently applies the existing module, role and showcase rules. View as feedback remains visible and disabled. Locked Requests and Finances use the original upgrade routes.

Each old job tab query remains supported: timeline, materials, labor, photos, findings, quote, invoice, report. The older issues query opens Findings, where crew-reported issues already live. Work contains all work panels, Money contains Quote and Invoice, and Report keeps its existing panel. Open field screen links exist on Jobs and each job. Manual create/send controls and read-only behavior are preserved.

Job and View as screenshots in this folder supplement the menu comparisons. Browser automation also checks all fourteen old office URLs, all job panel links, back navigation, module/role restrictions, feedback and upgrade behavior.

## Validation

- TypeScript and changed-file ESLint pass (four existing lint warnings). Final nav/Settings related Vitest: 69 passed. CommandBar and job behavior suites passed; the final job-layout suite passed all 6 tests after the spacing fix.
- Focused desktop/phone browser run: 33 passed, one phone instance of the mouse-drag test skipped. Two new URL-sweep assertions initially expected the wrong dashboard heading; the corrected URL sweep passed on both viewports. The final job group/deep-link/geometry checks passed on both viewports.
- Guide/demo entry: 8 desktop/phone checks passed. Settings -> Team -> Settings: 2 passed. Guidebook sections were opened and visually inspected at 1280 and 375 pixels with no horizontal overflow.
- Call-to-cash: 12/12 steps passed through local webhooks, APIs, emulators and captured email.
- Audit coverage: the original 19-screen inventory passed on desktop. Phone passed 18 screens, with Settings 34 pixels above its existing height budget. Relocating the old Advanced -> Manage team shortcut into the new Settings -> Team switch brought Settings to 5,349 pixels (budget 5,500). Settings and Billing then passed all audit checks on both viewports. Billing is now included in the default inventory: twenty screens covered across the cited runs, with all final per-screen checks passing. Thresholds were unchanged.
- For a focused audit after an isolated fix, use E2E_AUDIT_SCREENS=settings,billing. Unknown names fail; omitting it still audits the full inventory. This avoids repeating already-green screens.
- Extra T-343 CLI regression against the local emulator passed: optional Services skip; 3 invented rows / 2 matched / 1 unmatched; default dry-run writes no customer/history records; multi-line description and missing WO ID preserved; namespaced IDs distinct; repeat apply preserves merge fields and one customer. Temporary records and guard settings were cleaned up/restored.

WebKit/iPhone was skipped as requested because it cannot open a page on this machine. These checks do not prove real phone audio, real inbox delivery or production-build behavior. No full worker build or full browser suite was run; no push, merge or deployment occurred. No screen or job panel was removed. No client data, credentials or dependencies were added.

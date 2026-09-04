# Email Subject Line Conventions

All outbound emails from the platform follow a single documented convention:

## Format

```
[Category] Specific detail
```

- `[Category]` — a short bracketed prefix identifying the email type. 
- `Specific detail` — sentence-cased description providing at-a-glance context.
- Em-dash (`\u2014`) separates sub-elements within the detail portion.
- Middle-dot (`\u00b7`) separates sub-elements where space is tight.

## Categories

| Category | Pattern | Example |
|---|---|---|
| `[Appointment]` | `[Appointment] <action> — <name> · <date>` | `[Appointment] Confirmed — Jordan Blake · Tuesday, July 25, 2026 at 10:00 AM` |
| `[Appointment]` | `[Appointment] New Request — <name>` | `[Appointment] New Request — Priya Shah` |
| `[Assignment]` | `[Assignment] <job title> — <when>` | `[Assignment] Roof inspection — 120 NW 7th St — Monday, July 28` |
| `[Invoice]` | `[Invoice] Draft #<id> from <business>` | `[Invoice] Draft #J-1042 from Apex Roofing` |
| `[Invoice]` | `[Invoice] <id> from <sender>` | `[Invoice] INV-abc123 from Luxor AI` |
| `[Report]` | `[Report] <job title> from <business>` | `[Report] AC repair — 88 Brickell Ave from CoolTemp HVAC` |
| `[Escalation]` | `[Escalation] <business name>` | `[Escalation] Apex Roofing South Florida` |
| `[Feedback]` | `[Feedback] <business> — <preview>` | `[Feedback] Apex Roofing — Dashboard loads slowly on mobile` |
| `[Luxor AI]` | `[Luxor AI] Your <business> account is ready` | `[Luxor AI] Your Apex Roofing account is ready` |
| `[Alert]` | `[Alert] <what> — <count> since last check` | `[Alert] Vapi webhook auth failures — 12 since last check` |

## Call sites

| File | Subject line | Category |
|---|---|---|
| `src/lib/notify.ts` `buildCrewAssignmentEmail` | `[Assignment] <title> — <when>` | System |
| `src/lib/notify.ts` `buildCustomerConfirmationEmail` | `[Appointment] Confirmed — <when>` | System |
| `src/lib/notify.ts` `buildBusinessWelcomeEmail` | `[Luxor AI] Your <name> account is ready` | System |
| `src/lib/notify.ts` `buildFeedbackEmail` | `[Feedback] <business> — <preview>` | System |
| `src/lib/tools/agentTools.ts` `bookAppointment` | `[Appointment] New Request — <name>` | System |
| `src/lib/tools/agentTools.ts` `escalateCall` | `[Escalation] <business>` | System |
| `src/app/api/appointments/send-confirmation/route.ts` | `[Appointment] Confirmed — <name> · <date>` | System |
| `src/app/api/jobs/[jobId]/invoice/send/route.ts` | `[Invoice] Draft #<jobId> from <name>` | Tenant |
| `src/app/api/admin/invoices/[invoiceId]/send/route.ts` | `[Invoice] <invoiceId> from Luxor AI` | Admin |
| `src/app/api/jobs/[jobId]/report/send/route.ts` | `[Report] <title> from <name>` | Tenant |
| `src/lib/notify.ts` `buildWebhookHealthAlertEmail` | `[Alert] Vapi webhook auth failures — <count> since last check` | System |

## Tenant-branded vs system emails

- **Tenant-facing emails** (crew assignment, customer confirmation, invoice, report) carry the tenant's own business name and `logoUrl` as the sender identity. Their subjects use the tenant's business name after `from`.
- **Luxor-authored system emails** (welcome, feedback) carry the Luxor AI brand and use `from Luxor AI` or the `[Luxor AI]` prefix.
- The `From` header for all emails is `no-reply@luxordev.com` (the single `RESEND_FROM`).

## History

- Adopted 2026-07-25 (T-049). Extends the `[Category]` pattern established by T-043 (`[Luxor AI]`) and T-044 (`[Feedback]`).
- `[Alert]` added 2026-09-03 (T-065) for the new webhook auth-failure alert — an internal, Luxor-authored system email like `[Feedback]`/`[Luxor AI]`, sent to `connect@luxordev.com`.
- Prior subjects were ad-hoc: `New assignment: ...`, `Appointment confirmed — ...`, `Invoice ... from ...`, `Job Report — ...`, `New Appointment Request — ...`, `URGENT: Call Escalation — ...`.

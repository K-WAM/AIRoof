# Online payments (Pay now)

T-315 adds optional customer-invoice payments to the Billing product. These are
separate from Luxor's own invoices. Code only: no live service was contacted,
no platform was configured, and nothing was pushed or deployed.

## Business setup

The business owner opens Settings -> Getting paid -> Online payments, clicks
Connect Stripe, and completes Stripe Standard onboarding. Account Links return
and refresh URLs return to Settings and re-read the connected account flags.
The business turns on "Show a Pay now button on invoices" once Stripe enables
charges. Staff and viewers see status only. Platform-admin preview does not
offer an owner's connection controls.

Charges are DIRECT charges using Stripe's stripeAccount request option. The
business is merchant of record and pays Stripe's fees. Luxor takes no application
fee. Nothing passes through Luxor's balance. Existing manual payment instructions
and external payment links continue to work.

Server-only businesses/{id}.stripeConnect stores the account id and status flags.
The company bootstrap never includes that object. Direct member reads of a
business parent document containing Connect state are denied because Firestore
rules cannot redact individual fields; guarded API projections remain available.
The added rules-emulator case still needs running (Firebase CLI configstore EPERM
blocked emulator startup here). billingPrefs.payNow defaults off. An unresolved account creation older than 23 hours stops for office review
instead of risking a second account after Stripe's idempotency window.

## Customer flow

A successful invoice send creates a fresh random 32-byte token, stores only its
SHA-256 hash and 90-day expiry on the invoice, and emails Pay now. A successful
resend invalidates the previous link. A failed send keeps the old link intact.
Deposit and final invoices have separate tokens and balances.

The public page shows the business name/logo, invoice number, current amount
due and due date. It has Pay by card and Pay by bank (ACH) buttons. There is no
client JavaScript. POST rechecks the link and calculates the amount from the
server balance. Form-supplied amounts, account ids and URLs are rejected.
Stripe Checkout collects all payment information. Static return pages describe
submission without claiming that a bank payment has cleared.

Availability has one rule: Billing is on, Stripe is configured, a connected
account can charge, the owner opted in, the invoice is sent with a positive
balance, and the business is not in evaluation mode. Invalid, expired, paid,
void, disabled and evaluation links all return the same neutral wording.
Public HTML uses no-store, no-referrer, noindex and nosniff headers.

The sending tab can print a locally generated QR and clickable payment URL after
the server rechecks availability and the saved token hash. Tokens are never
persisted in browser storage. IMPORTANT LIMITATION: a one-way hash cannot recover
the original URL after a page reload. Print immediately after sending, or resend
and print. The full URL is shown, because no additional short-link credential
store or signing secret was authorized. Review this constraint before release.

## Webhook and money records

POST /api/webhooks/stripe-connect requires the raw Stripe signature and the
separate Connect webhook secret. Missing configuration returns 503; a bad or
missing signature returns 400. An event's connected account must match the
business's saved account, and the invoice and job must belong to that business.
Rejected bindings return 200 and log ids only. Database failures return 500 so
Stripe retries. Switching off Pay now never drops a payment that already moved.

Events handled:

- checkout.session.completed: paid records money; unpaid marks bank payment pending.
- checkout.session.async_payment_succeeded: records the cleared bank payment.
- checkout.session.async_payment_failed: clears matching pending state and adds a ledger note.
- charge.refunded: applies the cumulative refunded amount, preserves the original
  payment, adds a negative payment for the new refund, and reopens unpaid invoice
  status. A final job's paid marker is cleared; completed work dates are preserved.
  Missing charge metadata is resolved from its PaymentIntent on the direct account.
  A refund arriving before its payment returns 500 for retry rather than losing money.
- account.updated: updates the connected-account flags; older events are ignored.

Each event has one operation in businesses/{id}/operations. claimOperation creates
it, then the event's completion and money change commit in the SAME transaction.
The payment id stripe_<payment_intent> prevents separate paid events recording
twice. Per-session terminal state prevents late unpaid events reviving a cleared
or failed ACH attempt. Refund watermarks prevent double subtraction across
repeated or out-of-order refund events.

Payments use applyPayment and the existing receipt builder/sendEmail path with
the tenant businessId, including evaluation guarding. Receipt delivery runs with
Next after() so Stripe is acknowledged without waiting for email. Failed courtesy
receipts leave an office notice; they do not reverse recorded money. There is no
new durable receipt-retry worker. Overpayments are fully recorded and flagged for
office review. Billing and Finances use the existing payment and invoice balances.

## Environment and NEEDS-HUMAN

- STRIPE_SECRET_KEY: platform server key, also used by the existing Stripe client.
- STRIPE_CONNECT_WEBHOOK_SECRET: signing secret for this Connect endpoint;
  capability stripeConnectWebhook requires both values.
- NEXT_PUBLIC_APP_URL: correct HTTPS origin for onboarding and email/result links.

Before enabling this in a deployed environment, the owner/integrator must:

1. Create/configure the Stripe Connect platform with Standard connected accounts
   and direct charges. Confirm card and US bank ACH support for the business.
2. Register /api/webhooks/stripe-connect for events on connected accounts, selecting
   all five event types above; set STRIPE_CONNECT_WEBHOOK_SECRET server-side.
3. Set the platform key and app URL, then run sandbox onboarding, card, delayed ACH,
   failed ACH, refund, resend and duplicate-delivery checks after review/deployment.
4. Confirm the fee policy (this version: business pays Stripe; Luxor fee zero).
5. Review the print-link limitation above and the privacy-provider wording/version
   update with the integrator. Legal acceptance version is now 2026-11-05.
6. Restore local Git metadata write permission and create the six requested commits;
   this session cannot create index.lock in the assigned worktree's Git directory.

TODO: Card surcharges, including Roof Doctors' proposed 3%, need legal review and are not implemented.

## QUESTION FOR INTEGRATOR

The requested hash-only token storage cannot produce the same payment link after
reload, and the specified URL cannot also be a short manual-entry link without
another credential/alias design. This implementation uses session-only print URLs
and the full clickable URL plus QR. Confirm that limitation or approve a revised
durable print-link design before release. Local commits also need the Git metadata
permission issue resolved; no main-repository files were edited.

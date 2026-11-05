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

The send-claim transaction commits a random 16-byte base64url payLinkNonce and
payLinkExpiresAt (90 days) BEFORE attempting email delivery. The URL token is
HMAC-SHA256(PAY_LINK_SECRET, businessId:invoiceId:payLinkNonce), base64url encoded.
No token hash or clear bearer token is stored. Ordinary resends reuse the nonce
when at least 30 days remain; otherwise they issue a new 90-day link. Selecting
"New payment link (turns off earlier links)" explicitly rotates it. An old link
stops working after rotation. Failed sends leave the issued nonce in place.
Deposit and final invoices have separate nonces and balances.

Draft invoices are never payable, even with a valid nonce or a delivered email
whose finalization failed. The office resends after a failed send/finalization;
the saved nonce is reused under the ordinary reuse rule above. The link becomes
payable when finalization marks the invoice sent, using its current balance.
Paid/void invoices always refuse payment.

The public page shows the business name/logo, invoice number, current amount
due and due date. It has Pay by card and Pay by bank (ACH) buttons. There is no
client JavaScript. POST rechecks the link and calculates the amount from the
server balance. Form-supplied amounts, account ids and URLs are rejected.
Stripe Checkout collects all payment information. Static return pages describe
submission without claiming that a bank payment has cleared.

A valid payment link shows "A bank payment for this invoice is being processed.
It usually clears in a few business days." while payNowPending is active. GET
shows no payment buttons and POST creates no Checkout. Invalid/expired tokens
still receive the neutral unavailable page. Pending markers older than ten days
are ignored so a lost webhook cannot lock an invoice forever.

Creating Checkout saves payNowCheckout with sessionId, method, amount (cents)
and createdAt. A second POST within 30 minutes retrieves that session on the
connected account and reuses its URL. Choosing the other method shows the
existing method and "A payment was already started - finish it here." A complete
session shows the processing page; an expired session permits a fresh attempt.
A retrieval failure retries creation with the saved attempt's identical parameters
and idempotency key, so it cannot create a second session for that attempt.

payNowCheckoutAttempt reserves a nonce and method transactionally before calling
Stripe. The key is stable per invoice, attempt nonce and amount in cents, across
methods, concurrent requests, retries and time buckets. A confirmed expiration,
failed ACH, or stale pending marker permits a fresh attempt nonce; a changed
balance or payment-link nonce also starts a new tuple. This avoids reusing Stripe's
cached terminal session on a legitimate retry. Terminal webhook handling clears
matching pending, checkout and attempt markers; a late event cannot clear a newer
session. A fast terminal webhook cannot have its cleared markers restored by the
Checkout creation response.

Availability has one rule: Billing is on, Stripe and PAY_LINK_SECRET are configured, a connected
account can charge, the owner opted in, the invoice is sent with a positive
balance (including partly paid sent invoices), and the business is not in evaluation mode. Draft, invalid, expired, paid,
void, disabled, missing-business and evaluation links all return status 200 and
byte-identical neutral HTML, without a business name or logo:
"This payment link isn't available. Please contact the business that sent you this invoice."
Public HTML uses no-store, no-referrer, noindex and nosniff headers.

Owner/staff print views fetch GET /api/jobs/[jobId]/invoice/pay-link with
businessId and invoiceId. It uses verifyAuthAndRole and the noStore cache tier,
rechecks availability, and reconstructs { url, expiresAt } from an existing valid
nonce only. It never issues or rotates one. Pay online and its locally generated
QR therefore work after reload or in another tab. Viewers and crew cannot obtain
the bearer URL. No bearer URL is persisted in browser storage.

## Webhook and money records

POST /api/webhooks/stripe-connect requires the raw Stripe signature and the
separate Connect webhook secret. Missing configuration returns 503; a bad or
missing signature returns 400. An event's connected account must match the
business's saved account, and the invoice and job must belong to that business.
Unknown connected accounts return 200 without writes. For a known account with
a missing or foreign invoice/job (including missing or mismatched metadata), the
transaction stores a stripeUnmatched record only for completed-paid sessions,
async payment success, or refunds, then returns 200. Pending/failed ACH leaves
only a ledger note. Records use pay_<payment_intent> for payments and
refund_<charge id> for refunds under businesses/{businessId}/stripeUnmatched.
Each record contains kind (payment/refund), event type, Stripe references, dollars, currency, invoice
id from metadata when safe, receivedAt and reason; no customer name/email/card data.
The record and succeeded ledger state commit atomically. Payment notices deduplicate
completed and async-success events for the same intent. Each unmatched charge has
one refund record containing its cumulative refunded amount in dollars. Only a
larger cumulative amount updates it: $30 then $50 leaves one $50 record, and a
later $30 event cannot shrink it.
Database failures return 500 so
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
  For a matched payment, only the increase above its stripeRefunded watermark is
  subtracted: $30 then cumulative $50 adds negative entries of $30 and $20,
  reducing amountPaid by exactly $50. Replays and smaller cumulative amounts do nothing.
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

The Billing screen counts payments and refunds separately:
"Stripe received n payment(s) we couldn't match to an invoice - record them by hand."
and "n refund(s) we couldn't match." Rows say "Payment received" or "Refund sent".
Refunds show one row per charge, for example "Refund sent $50.00".
Expand "Amounts and Stripe references" to see the latest 30 events. GET
/api/company/billing/unmatched is owner/staff only, uses the central guard, takes
the tenant from the session, and returns total payment/refund counts and bounded
references through the private volatile cache tier.

## Environment and NEEDS-HUMAN

- STRIPE_SECRET_KEY: platform server key, also used by the existing Stripe client.
- STRIPE_CONNECT_WEBHOOK_SECRET: signing secret for this Connect endpoint;
  capability stripeConnectWebhook requires both values.
- PAY_LINK_SECRET: new server-only random secret, at least 32 characters. The
  payNow capability requires this and STRIPE_SECRET_KEY; missing/short disables
  Pay now everywhere. There is no fallback. Rotating this secret invalidates all
  existing links, so keep it stable.
- NEXT_PUBLIC_APP_URL: correct HTTPS origin for onboarding and email/result links.

Before enabling this in a deployed environment, the owner/integrator must:

1. Create/configure the Stripe Connect platform with Standard connected accounts
   and direct charges. Confirm card and US bank ACH support for the business.
2. Register /api/webhooks/stripe-connect for events on connected accounts, selecting
   all five event types above; set STRIPE_CONNECT_WEBHOOK_SECRET server-side.
3. Set the platform key, PAY_LINK_SECRET (at least 32 characters), and app URL, then run sandbox onboarding, card, delayed ACH,
   failed ACH, refund, resend and duplicate-delivery checks after review/deployment.
4. Confirm the fee policy (this version: business pays Stripe; Luxor fee zero).
5. Review the privacy-provider wording/version update with the integrator.
   Legal acceptance version is now 2026-11-05.

## Known limits

A sent-but-unpaid deposit is credited on the final by design: the deposit invoice
carries its own balance, and deposit plus final equals the contract. A deposit
refunded through Stripe after the final was sent reopens the deposit's balance;
the office handles it by hand.

Card surcharges, including Roof Doctors' proposed 3%, need legal review and are
not implemented. Real Stripe onboarding, settlement and inbox delivery were not
exercised in this code-only fix round. No external service or website was called.

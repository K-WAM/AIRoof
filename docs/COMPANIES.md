# Billing companies (T-316)

One workspace can bill under two to four legal companies while sharing its staff, customers, crews and phone agent.
With fewer than two valid profiles, the app keeps its existing screens, request payloads and stored record shapes:
there is no company switch, badge, extra Branding request or bootstrap companies field.

The fixed contract is `src/types/company.ts`. Profiles are stored as `BusinessConfig.billingCompanies`.
`src/lib/companies/companies.ts` owns validation-independent decisions: multi-company detection, the default and
document resolution. A document resolves its own company, then its job's, then its customer's, then the default.
Customer identity remains the existing normalized name and phone match key; a company never creates a second identity.

New customers and jobs get a company only in a multi-company workspace. Draft documents without an override follow
their job. The job switch saves immediately. A document switch changes that document alone. A successful send freezes
the company in the transaction that marks the document sent; failed sends release the claim without pinning a draft.
Sent documents show `Sent as RCU` (or the applicable short name). Pay now uses the default company's connected Stripe
account and is unavailable for documents resolved to another company.

Decisions and rendering live here:

- `companies/validation.ts`: profile limits, tenant-owned logo references, HTTPS pay links and owner-editable fields.
- `companies/assignment.ts`, `documentCompany.ts`: conditional record fields and tenant-scoped customer fallback reads.
- `companies/documentLetterhead.ts`: the shared company overlay, using the existing logo-library data URIs. Optional
  contact, license and payment values fall back to business settings; configure each company's own payment details.
- `companies/documentSend.ts` and `billing/jobInvoiceStore.ts`: quote/report claims and invoice/deposit send claims.
- `components/companies/CompanyToggle.tsx`: the one accessible switch; `CompanyBadge.tsx` remains the one list label.
- Render consumers: job quote/invoice/deposit/report previews and print twins; proposal, authorization and completion
  letters; invoice/quote/report send routes; receipt and reminder builders; public quote-response and pay pages.
  GET responses use the existing private cache tiers. Bootstrap exposes names and logos, never bank details.

To add a company, a superadmin opens **Admin > Clients > client config > Companies**, adds its stable lowercase id,
legal name and short name (at most eight characters), selects a logo already in that client's logo library, and saves.
Choose exactly one default. This round supports adding and editing, not removal or changing an existing id.
The owner can then edit contact, license, logo and payment details under **Library > Branding > Companies**. Staff may
read those details; only the owner can save them. Each company should have its own address, license and bank details
before customer documents are sent.

Local verification data is in `scripts/e2e/seed.cjs`: `e2e-roofpros` has RDSF (Roof Pros South, default) and RCU
(Concepts Unlimited), Lakeview County Schools, sent invoices `INV-3161`/`INV-3162`, and draft `INV-3163`.
`e2e/companies.spec.ts` covers desktop and phone behavior. The integrator runs it and reviews the phone screenshots;
this worker does not run the browser suite, push, merge, deploy, or contact providers.

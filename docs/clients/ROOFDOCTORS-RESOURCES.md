# RoofDoctors resources

Private source files are in git-ignored `client-resources/`. They contain real client data; do not copy records or amounts into this index.

## Resource tree

```text
client-resources/
  roofdoctors/
    01-conversations/
      chat-nov-2026.md                         Prospect notes; transition and support context
    02-data-export-jobba/
      customers.csv                            Customer export; migration mapping
      properties.csv                           Property export; site mapping
      inspections.csv                          Inspection export; job and finding mapping
      invoices.csv                             Invoice export; historical billing mapping
      material-items.csv                       Material catalog; Library pricing mapping
      vendors.csv                              Vendor export; future mapping
    03-documents/
      repairs-quote.pdf                        Quote layout; compare with Quote tab (T-257)
      repairs-document.docx                    Editable repairs document; compare document workflow
      invoice.pdf                              Invoice example; compare invoice layout
      invoice-alternate.pdf                    Alternate invoice example; compare layouts
      deposit-invoice.pdf                      Deposit invoice example; assess parity
      time-and-materials-work-authorization.docx  Work authorization; assess signature workflow
      icn-marked-up.pdf                        Marked-up ICN; assess document parity
      rcn-marked-up.pdf                        Marked-up RCN; assess document parity
    04-brand/
      website.png                              Website reference; branding
      email-format.png                         Email reference; formatting
    05-crm-import/
      roofdoctors-customers.csv                Customer summary for migration
      import-report.md                         Counts and source limitations
      build.mjs                                Rebuild the summary and report
  jobba-benchmark/
    app-screens/
      powerboard.png                           Powerboard; calendar benchmark
      screen-01.png                            App screen reference 1
      screen-02.png                            App screen reference 2
      screen-03.png                            App screen reference 3
      screen-04.png                            App screen reference 4
      screen-05.png                            App screen reference 5
      screen-06.png                            App screen reference 6
      screen-07.png                            App screen reference 7
      screen-08.png                            App screen reference 8
      screen-09.png                            App screen reference 9
      screen-10.png                            App screen reference 10
      screen-11.png                            App screen reference 11
    sales-pdf/
      page-01.png                              Sales material reference 1
      page-02.png                              Sales material reference 2
      page-03.png                              Sales material reference 3
      page-04.png                              Sales material reference 4
    training-schedule/
      page-01.png                              Training schedule reference 1
      page-02.png                              Training schedule reference 2
```

## CSV headers and import considerations

Counts are data rows; concerns are inferred from headers only, not a review of records.

- **customers.csv — 191 rows → Customer.** Columns: Name, Status, Priority, Type, Salesperson, Locations, Properties, Contacts, Open Deals, Open Service, Open Invoices, Last Activity, Date. No explicit customer ID; reconcile duplicates, relationships and dates.
- **properties.csv — 1,042 rows → address/site.** Columns: Property Address, Name, City, State, Owner, Open Service, Open Invoices, Open Deals, Last Activity, Date. No explicit property ID; match owners, normalize addresses and dates, and check duplicates.
- **inspections.csv — 248 rows → jobs/findings.** Columns: ID, Customer, Property, Address, City, State, Zip, Status, Job Type, Created By, Due. Preserve source IDs; match customer and property, normalize due dates, and check duplicates. Findings are not explicit in the headers.
- **invoices.csv — 326 rows → JobInvoice history.** Columns: Date, Invoice ID, Name, Bill To, Amount, Tax, Billed, Voided, Credits, Amt Due, Paid, Status. Preserve invoice IDs; reconcile customer/job links, dates, statuses and duplicates.
- **material-items.csv — 194 rows → Library pricing.** Columns: Enabled, Name, Category, Type, Std Cost, Pkg Price, Manufacturer, Product Line, MFG Part #, Description. No general item ID; use part numbers where available, check duplicates and price semantics.
- **vendors.csv — 11 rows → no entity yet.** Columns: Name, Type, Address, City, State, Main, Contact. No explicit vendor ID; resolve duplicates and contact/address mapping before import.

## CRM import file

`05-crm-import/roofdoctors-customers.csv` contains one row per exported customer. Columns: `name`, `kind`, `phone`, `email`, `address`, `city`, `state`, `zip`, `contacts`, `property_count`, `property_addresses`, `inspections_count`, `last_inspection_date`, `invoices_count`, `total_billed`, `amount_due`, `last_invoice_date`, `status`, `priority`, `salesperson`, `jobba_customer_ref`, `tags`, `notes`, `possible_duplicate_of`. Review `import-report.md` for completeness and unmatched source rows before loading. The summary includes migration metadata beyond the current Customer fields; the current Customer type supports only residential and commercial kinds, and contacts and tags are arrays. A loader must map these fields and resolve any missing or unsupported values.

From the repository root, re-run `node client-resources/roofdoctors/05-crm-import/build.mjs`. The generated files and script remain in the git-ignored private resources folder.

## What RoofDoctors needs that we don't have yet

The notes and examples establish these transition needs; verify current product coverage before treating each as a confirmed gap:

- Migration of customer and property history, including historical work and invoice records.
- A deposit invoice using their template; the notes say their current Jobba workflow does not provide it.
- A time-and-materials work authorization that can be returned signed before work becomes a job.
- Quote, invoice, ICN and RCN document parity with the supplied examples and mark-ups.
- Guided onboarding and technician training, including translation where needed and follow-up sessions.
- Responsive support with status updates and an expected resolution date.

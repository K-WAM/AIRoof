# Jobba setup mapping

Plan first: use existing Library, customer and invoice models. Import only additive data with a clear home. Preserve unmapped rows in tenant-scoped source records; never create screens, accounts, invites, messages or live work from these exports.

Defaults: multiple payment terms cannot safely choose the business default. Preserve the choices and request owner selection. Finding taxonomies have category-only data, so store categories separately from catalog items; never fabricate solutions.

| File | Rows | Columns | Existing home / action | Duplicate |
|---|---:|---|---|---|
| Company contacts.csv | 16 | Enabled, Primary, Employee, User, First Name, Last Name, Position, Type, Mobile Phone, Email, Comments | Team/contact metadata. Employee rows have no customer or company foreign key. Preserve as source records; owner must choose staff vs company contacts. No accounts or invites. | No exact byte duplicate detected |
| Crew Types.csv | 3 | Enabled, Name, Types, Description | Library crews: preserve type labels on imported crews; also retain source type definitions. No fabricated people. | No exact byte duplicate detected |
| Crews.csv | 5 | Enabled, Name, Types, Modes, Foreman, Supervisor, Description | Library crews, stable source IDs; match existing people only when an actual person row identifies them uniquely. | No exact byte duplicate detected |
| customers.csv | 191 | Name, Status, Priority, Type, Salesperson, Locations, Properties, Contacts, Open Deals, Open Service, Open Invoices, Last Activity, Date | Existing Customers entities; missing list/search fields repaired by T-340. | No exact byte duplicate detected |
| deals.csv | 124 | ID, Name, Description, Salesperson, Customer, Deal Amount, Bid Due, Probability, Est. close, Status, Stage, Sale Amount, Closed | Pipeline opportunity/sales history has no exact current home; owner decision. Never convert to caller requests automatically. | No exact byte duplicate detected |
| Deficiency Types.csv | 91 | Enabled, Name, Description | Work-catalog finding category definitions. No solution text supplied; never invent a standard repair. | No exact byte duplicate detected |
| Dispatch Status Types.csv | 17 | Enabled, Code, Name, Description | Calendar dispatch statuses are fixed. Owner mapping required; no workflow changes. | No exact byte duplicate detected |
| Element Types.csv | 2 | Enabled, Section, Name, System Category, Plot Type, Marker, Description | Work-catalog category definitions with source kind/section metadata. | No exact byte duplicate detected |
| Field Condition Types.csv | 45 | Enabled, Name, Measure Type, UOM, Description | Potential inspection finding metadata; measurement types lack a current field model. Owner decision. | No exact byte duplicate detected |
| Grade Types.csv | 5 | Enabled, Years of Service, Name, Description | No grade/remaining-life model today. Owner decision. | No exact byte duplicate detected |
| inspections.csv | 248 | ID, Customer, Property, Address, City, State, Zip, Status, Job Type, Created By, Due | Existing past-work history, not live jobs/bookings. Used for customer activity dates. | No exact byte duplicate detected |
| invoices.csv | 326 | Date, Invoice ID, Name, Bill To, Amount, Tax, Billed, Voided, Credits, Amt Due, Paid, Status | Existing invoice history, not active invoices. Used for customer activity dates. | No exact byte duplicate detected |
| Job status types - Deal Status.csv | 5 | Enabled, Code, Name, Description | App workflow statuses are fixed; owner mapping decision. Preserve source; no workflow mutation. | No exact byte duplicate detected |
| Job status types - Deficiencies.csv | 3 | Enabled, Code, Name, Description | App workflow statuses are fixed; owner mapping decision. Preserve source; no workflow mutation. | No exact byte duplicate detected |
| Job status types - Production.csv | 6 | Enabled, Code, Name, Description | App workflow statuses are fixed; owner mapping decision. Preserve source; no workflow mutation. | No exact byte duplicate detected |
| Job status types - Project Phase.csv | 6 | Enabled, Code, Name, Description | App workflow statuses are fixed; owner mapping decision. Preserve source; no workflow mutation. | Job status types - Production.csv |
| Job status types - Purchase Order.csv | 11 | Enabled, Code, Name, Description | App workflow statuses are fixed; owner mapping decision. Preserve source; no workflow mutation. | No exact byte duplicate detected |
| Job Types.csv | 11 | Enabled, Name, Type, Guided, Terms, Warranty, Description | Job type presets are industry-defined; retain source. Owner must choose mappings, terms and warranties. | No exact byte duplicate detected |
| Labor Categories.csv | 4 | Enabled, Code, Name, UOM, Travel, Description | Labor metadata. No category field on labor rates today; preserve source, owner decision on grouping. | No exact byte duplicate detected |
| Labor Types.csv | 3 | Enabled, Code, Name, Rate, UOM, Description | Library pricing.laborRates: role and hourly rate only when UOM is hourly; retain non-hour units for owner review. | No exact byte duplicate detected |
| Maintenance Plans.csv | 9 | Enabled, Name, Description, Term, Interval, Billing Mode, Price | No maintenance-plan contract/billing model today. Owner decision. | No exact byte duplicate detected |
| Maintenance Types.csv | 2 | Enabled, Name, Description, Mode | Maintenance taxonomy only; owner decision with plans. | No exact byte duplicate detected |
| Material Categories.csv | 26 | Enabled, Code, Name, UOM, Description | Material catalog category and category UOM; attach to matching imported materials. | No exact byte duplicate detected |
| material-items.csv | 194 | Enabled, Name, Category, Type, Std Cost, Pkg Price, Manufacturer, Product Line, MFG Part #, Description | Existing material import; enrich category/unit fields without duplicating names. | No exact byte duplicate detected |
| Order Types.csv | 10 | Enabled, Name, Type, Mode, Description | No matching purchase/order workflow today. Owner decision. | No exact byte duplicate detected |
| Payment Terms.csv | 6 | Enabled, Name, Payment due, Discount rate, Discount days | Invoice defaults: preserve all term choices. Select a default only when unambiguous; multiple enabled terms require owner selection. Discounts have no current UI. | No exact byte duplicate detected |
| Priorities.csv | 5 | Enabled, Rank, Name, Description | App priority values are fixed; owner must map ranks before changing behavior. | No exact byte duplicate detected |
| properties.csv | 1042 | Property Address, Name, City, State, Owner, Open Service, Open Invoices, Open Deals, Last Activity, Date | Existing customer properties; no new screen. | No exact byte duplicate detected |
| Safety Checklist (1).csv | 11 | Seq, Name, Type, Required | No safety checklist model today; owner decision. Preserve both source exports. | No exact byte duplicate detected |
| Safety Checklist.csv | 29 | Seq, Name, Type, Required | No safety checklist model today; owner decision. Preserve both source exports. | No exact byte duplicate detected |
| Services.csv | 791 | WO ID, Deal ID, Description, Customer, Property, Address, City, State, Zip, Type, Status, Job Type, Created By, Due | Past service/work-order data. Potential past-work history, but owner must decide treatment of open rows. Do not create jobs or schedule visits. | No exact byte duplicate detected |
| Setup Material Items.csv | 194 | Enabled, Name, Category, Type, Std Cost, Pkg Price, Manufacturer, Product Line, MFG Part #, Description | Second material-item export; compare content hashes before importing. Merge by normalized material name. | No exact byte duplicate detected |
| System Categories (1).csv | 4 | Enabled, Code, Name, Trade Type, Description | Work-catalog category definitions; deduplicate repeated exports by kind and normalized name. | No exact byte duplicate detected |
| System Categories (2).csv | 4 | Enabled, Code, Name, Trade Type, Description | Work-catalog category definitions; deduplicate repeated exports by kind and normalized name. | System Categories (1).csv |
| System Categories (3).csv | 4 | Enabled, Code, Name, Trade Type, Description | Work-catalog category definitions; deduplicate repeated exports by kind and normalized name. | System Categories (2).csv |
| System Categories.csv | 4 | Enabled, Code, Name, Trade Type, Description | Work-catalog category definitions; deduplicate repeated exports by kind and normalized name. | System Categories (3).csv |
| System Types (1).csv | 5 | Enabled, Code, Category, Name, Description | Work-catalog system categories; retain source category relationship. | No exact byte duplicate detected |
| System Types (2).csv | 9 | Enabled, Code, Category, Name, Description | Work-catalog system categories; retain source category relationship. | No exact byte duplicate detected |
| System Types (3).csv | 6 | Enabled, Code, Category, Name, Description | Work-catalog system categories; retain source category relationship. | No exact byte duplicate detected |
| System Types.csv | 4 | Enabled, Code, Category, Name, Description | Work-catalog system categories; retain source category relationship. | No exact byte duplicate detected |
| Tax Types.csv | 1 | Enabled, Code, Jurisdiction, Type, Tax Rate, GL Type, Description | Library pricing.defaultTaxRate when one enabled numeric rate is present and no default exists. Preserve jurisdiction/type source metadata. | No exact byte duplicate detected |
| Unit Of Measure.csv | 61 | Enabled, Name, Type, Description | Material catalog unit definitions; reference by category UOM. Preserve unused units; no duplicate screen. | No exact byte duplicate detected |
| vendors.csv | 11 | Name, Type, Address, City, State, Main, Contact | No vendor directory today; owner decision. Preserve source only. | No exact byte duplicate detected |
| Warranty Types.csv | 6 | Enabled, Name, Description, Type, Materials, Labor | No warranty template selection model today; owner decision. Preserve all source data. | No exact byte duplicate detected |

## Owner decisions

- Select the default payment term from the preserved enabled options; discount handling is not implemented.
- Decide homes/mappings for safety checklists, deals, service orders, workflow statuses, priorities, warranty and maintenance data.
- Confirm whether company-contact rows are employees or business contacts before linking anyone. No login or invite is created.
- Approve any taxonomy consolidation; source kind and original rows remain available to avoid silent loss.

## Import behavior and proof

Run the existing importer with `--setup` to include setup exports. It remains dry-run by default, allowlisted to the client workspace or an emulator `e2e-*` tenant, and requires the evaluation guard plus matching confirmation to apply. Use `--report-dir=.e2e/import-reports` when reading the read-only source folder.

- All 44 files contain 3,560 source rows in total. Every row, including repeated rows, is retained with file and row number under the tenant's `jobbaSetup` collection. Re-runs preserve existing source records.
- The two material exports overlap on 194 rows / 191 unique names. Prices match; differences occur in Category (3 rows), Type (3 rows), and Description (2 rows). Existing prices and units are retained. Missing categories are filled; the source unit is also retained as `importedUnit` when an existing unit is already present.
- Clear-home projection: 5 crews with crew-type labels, 3 hourly labor rates, 191 material category/unit mappings, 6 available payment terms, 1 unambiguous tax rate, and 115 distinct finding-category labels. Category-only definitions do not become invented repair instructions.
- Payment term choices appear in the existing Settings > Getting paid > Payment due selector. No default is chosen between the 6 options. Source discounts remain preserved and are not applied automatically.
- Emulator proof: 191 imported customers are returned by the existing list API and searchable on the Customers page. A missing-field repair changed 191 records, then zero. A repeat setup import left the projected setup content unchanged and the Auth account count at 16.

No source names, rates, addresses, contact values or descriptions are included in this mapping document.

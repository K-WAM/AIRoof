// A business's customer roster (Library's Customers tab). Jobs reference a
// customer by id but keep their own denormalized clientName/clientPhone/
// address (src/types/jobs.ts) so lists and reports never need a second
// fetch — customerId is relational truth, the job's own fields are a
// point-in-time snapshot. See src/lib/customers/resolve.ts for how a job
// gets linked to a customer without adding a click to the job-create flow.

export interface CustomerContact {
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
}

export type CustomerKind = "residential" | "commercial";

/** A service address under a customer (a property manager's buildings). Imported from Jobba; at most 500 per customer. */
export interface CustomerProperty {
  name?: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  /** The source system's own id for this property, for idempotent re-imports. Never rendered. */
  sourceRef?: string;
}

export const CUSTOMER_PROPERTIES_MAX = 500;

export interface Customer {
  /** Billing company (src/types/company.ts); missing = the business's default company. */
  companyId?: string;
  customerId: string; // "C-1000+" via businesses/{bid}.customerCounter
  businessId: string;
  name: string;
  kind: CustomerKind;
  phone?: string;
  email?: string;
  address?: string;
  /** Additional site contacts (a commercial account's facilities manager, etc). Max 10. */
  contacts?: CustomerContact[];
  notes?: string;
  /** Max 10. */
  tags?: string[];
  /** Beats the Library's catalog defaults on this customer's invoices when set. */
  defaultTaxRate?: number;
  defaultLaborRate?: number;
  /** Service addresses (plan §7, T-311). At most CUSTOMER_PROPERTIES_MAX. */
  properties?: CustomerProperty[];
  /** The business's own short customer code (e.g. "ABC01"), shown on documents as "Customer ID". */
  customerCode?: string;
  // Rollups — maintained by resolveCustomer/bumpCustomerJobStats as jobs get
  // linked. Never treated as source of truth; recomputable from a jobs query.
  jobCount: number;
  lastJobAt?: number;
  lifetimeInvoiced?: number;
  /** `${normalizedName}|${last7PhoneDigits}` — the identity used to find-or-create. */
  matchKey: string;
  /** Prefix-token index for client-side/Firestore search. Never rendered. */
  searchTokens: string[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

/** The list-view shape — what GET ?fields=slim returns for instant client-side search. */
export interface CustomerSlim {
  companyId?: string;
  customerId: string;
  name: string;
  kind: CustomerKind;
  phone?: string;
  address?: string;
  jobCount: number;
  lastJobAt?: number;
}

export function toCustomerSlim(c: Customer): CustomerSlim {
  return {
    customerId: c.customerId,
    ...(c.companyId ? { companyId: c.companyId } : {}),
    name: c.name,
    kind: c.kind,
    phone: c.phone,
    address: c.address,
    jobCount: c.jobCount,
    lastJobAt: c.lastJobAt,
  };
}

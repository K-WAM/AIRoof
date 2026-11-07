// Vendors (T-370, owner 2026-11-06): the manufacturers, suppliers and subcontractors a business buys from or works
// with. A plain list in Library → Vendors (labelled "Suppliers" where the industry already calls its crews "Vendors",
// e.g. property management). Nothing is ever sent to a vendor from the app.
//
// Storage: businesses/{businessId}/vendors/{vendorId} (server-only: no Firestore rule matches it, the catch-all denies).

import type { Provenance } from "@/types/provenance";

export interface Vendor {
  vendorId: string;
  name: string;
  /** Free text kept as the source wrote it, e.g. "Manufacturer", "Supplier", "Subcontractor". */
  type?: string;
  address?: string;
  city?: string;
  /** Two-letter state. */
  state?: string;
  zip?: string;
  /** E.164 when it parses, else as written. */
  phone?: string;
  contactName?: string;
  email?: string;
  website?: string;
  notes?: string;
  active: boolean;
  provenance: Provenance;
  createdAt: number;
  updatedAt: number;
}

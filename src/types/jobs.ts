export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ParsedUpdate {
  // dateMs = source field-update timestamp, stamped by buildProjection so multi-day jobs
  // can show which day each event happened on.
  timeline: Array<{ time?: string; description: string; dateMs?: number }>;
  materials: Array<{ item: string; quantity?: string; unit?: string; cost?: number }>;
  labor: Array<{ description: string; hours?: number; rate?: number; arrivalTime?: string; departureTime?: string }>;
  issues: Array<{ description: string; severity: "low" | "medium" | "high"; resolution?: string }>;
  invoiceSuggestions: InvoiceLineItem[];
  // Optional correction signal emitted by parseFieldUpdate when the speaker is fixing a prior entry.
  // The LLM only flags intent + values; the server resolves the target and does all arithmetic.
  correction?: { item: string; newValue: number; field?: "materials" | "labor"; targetHint?: string };
}

export interface FieldUpdate {
  updateId: string;
  // "normal" (default) = additive line items; "correction" = override of one prior entry's line item
  kind?: "normal" | "correction";
  rawText: string;
  language?: string;
  submittedBy?: string;
  createdAt: number;
  parsed?: ParsedUpdate;
  parseError?: string;
  // Correction fields (kind === "correction") — append-only override of one prior entry
  targetUpdateId?: string;
  correctionField?: "materials" | "labor";
  correctionItem?: string;       // normalized item/worker name being corrected
  correctionNewValue?: number;   // new quantity (materials) or hours (labor)
}

// A correction the server proposes but has NOT yet applied — shown to the field user
// as a one-tap confirm card. All numbers are computed in code, never by the LLM.
export interface ProposedCorrection {
  targetUpdateId: string;
  field: "materials" | "labor";
  item: string;
  oldValue: number;
  newValue: number;
  currentTotal: number;  // running total before the correction
  newTotal: number;      // running total after the correction
  rawText: string;
}

export interface FieldMaterial {
  name: string;
  quantity: number;
  unit: string;
}

export interface FieldLaborEntry {
  workerName: string;
  role?: string;
  timeIn?: string;
  timeOut?: string;
  hours?: number;
}

export interface FieldTimelineEvent {
  eventType: string;
  time?: string;
  notes?: string;
}

// One entry in a Job's `auditLog` — who spoke an update and what it changed.
export interface FieldAuditEntry {
  timestamp: string;
  userId: string;
  userName: string;
  transcript: string;
  changesSummary: string;
}

export interface Job {
  jobId: string;            // e.g. "J-1042"
  businessId: string;
  title: string;
  // "open" kept for backward compat with existing Firestore docs; maps to "inspection" in UI
  status: "open" | "inspection" | "quoted" | "in_progress" | "invoiced" | "complete";
  address?: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  serviceType?: string;
  appointmentId?: string;
  notes?: string;
  invoiceId?: string;
  createdAt: number;
  updatedAt: number;
  // Authoritative projection: deterministically computed in code from the updates ledger.
  // Job-detail tabs, invoice, and report all read from here (single source of truth).
  parsed?: ParsedUpdate;
  // Free-text scope/resolution narrative for the report (admin-edited)
  reportNotes?: string;
  // Crew scheduling (Phase 5)
  assignedCrewId?: string;
  scheduledStart?: number;
  scheduledEnd?: number;
  crewConfirmed?: boolean;
  // Job-site photos (Phase 2) — meta + thumbnail; full blobs live in photoBlobs subcollection
  photos?: JobPhotoMeta[];
  // Legacy display mirror of `parsed`, kept so /company/field JobLogCard works unchanged
  materials?: FieldMaterial[];
  laborEntries?: FieldLaborEntry[];
  timelineEvents?: FieldTimelineEvent[];
  fieldNotes?: string[];
  totalLaborHours?: number;
  auditLog?: FieldAuditEntry[];
}

export interface JobPhotoMeta {
  photoId: string;
  label: string;
  uploadedBy?: string;
  createdAt: number;
  includeInReport?: boolean;
  thumbB64: string;  // small ~240px JPEG data (no data: prefix)
  w?: number;
  h?: number;
}

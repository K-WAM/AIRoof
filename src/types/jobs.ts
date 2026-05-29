export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ParsedUpdate {
  timeline: Array<{ time?: string; description: string }>;
  materials: Array<{ item: string; quantity?: string; unit?: string; cost?: number }>;
  labor: Array<{ description: string; hours?: number; rate?: number; arrivalTime?: string; departureTime?: string }>;
  issues: Array<{ description: string; severity: "low" | "medium" | "high" }>;
  invoiceSuggestions: InvoiceLineItem[];
}

export interface FieldUpdate {
  updateId: string;
  rawText: string;
  language?: string;
  submittedBy?: string;
  createdAt: number;
  parsed?: ParsedUpdate;
  parseError?: string;
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
  // Structured field data written by AI after voice updates
  materials?: FieldMaterial[];
  laborEntries?: FieldLaborEntry[];
  timelineEvents?: FieldTimelineEvent[];
  fieldNotes?: string[];
  totalLaborHours?: number;
  auditLog?: FieldAuditEntry[];
}

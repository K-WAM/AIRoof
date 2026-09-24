import type { JobFinding, WorkCatalogLine } from "./workCatalog";

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";
export interface QuoteLine extends WorkCatalogLine {
  lineId: string;
  findingId?: string;
}
export interface JobQuote {
  quoteId: string;
  businessId: string;
  jobId: string;
  customerId?: string;
  billTo: { name: string; email?: string; phone?: string; address?: string };
  status: QuoteStatus;
  findings: JobFinding[];
  lines: QuoteLine[];
  hideMaterials: boolean;
  notes?: string;
  validUntil: number;
  subtotal: number;
  total: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  sentAt?: number;
  sentTo?: string;
}

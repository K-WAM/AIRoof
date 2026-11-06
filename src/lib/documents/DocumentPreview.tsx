import type { ReactNode } from "react";
import type { DocumentGroup } from "./groups";
import type { Letterhead } from "./letterhead";
import type { ReportQuoteSection } from "./reportQuote";
import type { RenderedNotice } from "./notices";
import type { JobPhotoMeta } from "@/types/jobs";
import { StandardDocument } from "./StandardDocument";
import { ClassicDocument } from "./ClassicDocument";

export type DocumentPhoto = JobPhotoMeta & { fullB64?: string; src?: string };

export interface DocumentPreviewProps {
  findingSections?: boolean;
  serviceAt?: string; customerCode?: string; depositsApplied?: Array<{ invoiceId: string; amount: number }>;
  children?: ReactNode;
  /** Screen-only content placed where the emailed invoice puts its Pay now button (after the total and How to pay). */
  afterHowToPay?: ReactNode;
  title: string; brand: Letterhead; meta: [string, string][];
  billTo: { name: string; address?: string; phone?: string }; partyLabel?: string; opening?: string; narrative?: string; findings?: Array<{ category?: string; problem: string; solution: string; note?: string }>; closing?: string; thankYou?: string;
  groups?: DocumentGroup[]; sections?: Array<{ title: string; lines: string[] }>; totalLabel?: string; total?: number; className?: string;
  /** INVOICE, classic look only: the Subtotal / Sales Tax rows printed above the total (the standard look shows the total alone). */
  totals?: { subtotal: number; tax: number };
  /** REPORT only: the optional "Include the quote" block (a sent/accepted quote's work and prices). Built by reportQuoteSection(). */
  quoteSection?: ReportQuoteSection | null;
  /** QUOTE / INVOICE only: "Terms & notices" — pass what noticesForDocument() approved (nothing until the owner approves the wording). */
  notices?: RenderedNotice[];
  photos?: DocumentPhoto[];
  /** INVOICE only (Billing product): the business's own payment details, printed under the total. */
  howToPay?: { instructions: string; link: string } | null;
}

export function DocumentPreview(props: DocumentPreviewProps) {
  // A business on the classic letterhead (BusinessConfig.documentStyle) gets its own layout; everyone else is unchanged.
  if (props.brand.documentStyle === "classic") return <ClassicDocument {...props} />;
  return <StandardDocument {...props} />;
}

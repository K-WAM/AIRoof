"use client";

import { useFormat } from "@/hooks/useFormat";
import type { JobQuote } from "@/types/quote";

type QuoteLike = Pick<JobQuote, "quoteId" | "status" | "sentAt" | "answeredAt">;
type InvoiceLike = { invoiceId?: string | null; status: string | null; sentAt?: number; paidAt?: number };

/**
 * One line on the record tabs (Findings, Activity, Materials, Labor) when a sent quote or a sent invoice is locked:
 * anything changed here from now on will NOT reach that document. It is a heads-up, not a block — editing stays possible
 * (the crew's notes and the office's corrections keep flowing into the job) — but it stops the office assuming a sent
 * document quietly updated itself.
 */
export function LockNote({ quote, invoice }: { quote?: QuoteLike | null; invoice?: InvoiceLike | null }) {
  const { fmtDate } = useFormat();
  const lines: string[] = [];

  if (invoice && (invoice.status === "sent" || invoice.status === "paid")) {
    const paid = invoice.status === "paid";
    const at = paid ? invoice.paidAt : invoice.sentAt;
    lines.push(`Invoice${invoice.invoiceId ? ` ${invoice.invoiceId}` : ""} was ${paid ? "paid" : "sent"}${at ? ` on ${fmtDate(at)}` : ""}. It is locked, so changes here won't change it.`);
  }
  if (quote && (quote.status === "sent" || quote.status === "accepted")) {
    const accepted = quote.status === "accepted";
    const at = accepted ? quote.answeredAt : quote.sentAt;
    lines.push(`Quote ${quote.quoteId} was ${accepted ? "accepted" : "sent"}${at ? ` on ${fmtDate(at)}` : ""}. It is locked, so new findings won't change it.`);
  }
  if (lines.length === 0) return null;

  return (
    <div className="lock-note no-print" role="note">
      {lines.map((line) => <p key={line}>🔒 {line}</p>)}
    </div>
  );
}

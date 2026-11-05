import { getCapabilityStatus } from "@/lib/config/env";
import type { BusinessConfig } from "@/types";
import type { JobInvoice } from "@/types/invoice";
import { productsOf } from "@/lib/products/products";
import { isEvaluationBusiness } from "@/lib/comms/evaluationGuard";
import { invoiceBalance } from "./customerPayments";

export type PayNowBusiness = Pick<BusinessConfig, "products" | "billingPrefs" | "stripeConnect" | "outboundEmailAllowlist"> & { stripeConfigured: boolean };

/** Server eligibility. Only sent invoices with an outstanding balance are payable. */
export function payNowAvailability(business: PayNowBusiness, invoice: Pick<JobInvoice, "status" | "total" | "amountPaid" | "payLinkNonce" | "payLinkExpiresAt">): boolean {
  return productsOf(business).billing && business.stripeConfigured && getCapabilityStatus("payNow") === "configured"
    && business.stripeConnect?.chargesEnabled === true && !!business.stripeConnect.accountId
    && business.billingPrefs?.payNow === true && !isEvaluationBusiness(business)
    && invoice.status === "sent" && invoiceBalance(invoice) > 0;
}

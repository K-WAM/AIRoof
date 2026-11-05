import type { BusinessConfig } from "@/types";
import type { JobInvoice } from "@/types/invoice";
import { productsOf } from "@/lib/products/products";
import { isEvaluationBusiness } from "@/lib/comms/evaluationGuard";
import { invoiceBalance } from "./customerPayments";

export type PayNowBusiness = Pick<BusinessConfig, "products" | "billingPrefs" | "stripeConnect" | "outboundEmailAllowlist"> & { stripeConfigured: boolean };

/** Pure: callers supply the server's configured capability; never trust a browser's value. */
export function payNowAvailability(business: PayNowBusiness, invoice: Pick<JobInvoice, "status" | "total" | "amountPaid">): boolean {
  return productsOf(business).billing && business.stripeConfigured
    && business.stripeConnect?.chargesEnabled === true && !!business.stripeConnect.accountId
    && business.billingPrefs?.payNow === true && !isEvaluationBusiness(business)
    && invoice.status === "sent" && invoiceBalance(invoice) > 0;
}

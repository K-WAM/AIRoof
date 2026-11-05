import { getCapabilityStatus } from "@/lib/config/env";
import { validPayLink } from "./payNowToken";
import type { BusinessConfig } from "@/types";
import type { JobInvoice } from "@/types/invoice";
import { productsOf } from "@/lib/products/products";
import { isEvaluationBusiness } from "@/lib/comms/evaluationGuard";
import { invoiceBalance } from "./customerPayments";

export type PayNowBusiness = Pick<BusinessConfig, "products" | "billingPrefs" | "stripeConnect" | "outboundEmailAllowlist"> & { stripeConfigured: boolean };

/** Server eligibility. A claimed send activates its durable link before email delivery. */
export function payNowAvailability(business: PayNowBusiness, invoice: Pick<JobInvoice, "status" | "total" | "amountPaid" | "payLinkNonce" | "payLinkExpiresAt">): boolean {
  return productsOf(business).billing && business.stripeConfigured && getCapabilityStatus("payNow") === "configured"
    && business.stripeConnect?.chargesEnabled === true && !!business.stripeConnect.accountId
    && business.billingPrefs?.payNow === true && !isEvaluationBusiness(business)
    && (invoice.status === "sent" || invoice.status === "draft" && validPayLink(invoice)) && invoiceBalance(invoice) > 0;
}

import { documentLetterhead } from "@/lib/companies/documentLetterhead";
import { loadDocumentCompany } from "@/lib/companies/documentCompany";
import { companiesOf, isMultiCompany } from "@/lib/companies/companies";
import type { LibraryLogo } from "@/types/library";
// Overdue reminders to the CLIENT's customers (Billing product), run by the daily recurring-invoices cron.
// Per client with Billing on and reminders on: read its sent invoices (one equality query — no composite index), email
// the 1/7/14-day reminder that is due (customerReminderDue), and record it so it never goes twice. Bounded per client
// and per run so a big backlog can't eat the free-tier read/email quota in one go.

import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { sendEmail } from "@/lib/comms/send";
import { productsOf } from "@/lib/products/products";
import { buildCustomerReminderEmail, customerReminderDue, daysPastDue, effectiveBillingPrefs, invoiceBalance } from "./customerPayments";
import type { JobInvoice } from "@/types/invoice";

const INVOICES_PER_CLIENT = 200;
const EMAILS_PER_RUN = 100;

export async function runCustomerReminders(db: Firestore, now = Date.now()): Promise<{ reminded: string[]; errors: string[] }> {
  const reminded: string[] = [];
  const errors: string[] = [];
  const businesses = await db.collection("businesses").select("billingCompanies", "address", "licenseNumber", "logoUrl", "products", "billingPrefs", "businessName", "brandColor", "contactPhone", "contactEmail", "notificationEmail", "timezone", "isDemo").get();
  for (const biz of businesses.docs) {
    if (reminded.length >= EMAILS_PER_RUN) break;
    const data = biz.data();
    if (!productsOf(data).billing || data.isDemo === true || biz.id.startsWith("demo-")) continue;
    const prefs = effectiveBillingPrefs(data);
    if (!prefs.remindersOn) continue;
    const baseBusiness = { businessName: String(data.businessName || ""), brandColor: data.brandColor, contactPhone: data.contactPhone, contactEmail: data.contactEmail };
    if (!baseBusiness.businessName) continue;
    try {
      const logos = isMultiCompany(data) ? ((await db.collection(`businesses/${biz.id}/library`).doc("logos").get()).data()?.logos ?? []) as LibraryLogo[] : [];
      const sent = await db.collection(`businesses/${biz.id}/invoices`).where("status", "==", "sent").limit(INVOICES_PER_CLIENT).get();
      for (const doc of sent.docs) {
        if (reminded.length >= EMAILS_PER_RUN) break;
        const invoice = { ...(doc.data() as JobInvoice), invoiceId: doc.id };
        const due = customerReminderDue(invoice, now);
        const to = (invoice.sentTo || invoice.billTo?.email || "").trim();
        if (due === null || !to) continue;
        const job = isMultiCompany(data) && !companiesOf(data).some(c => c.id === invoice.companyId)
          ? (await db.collection(`businesses/${biz.id}/jobs`).doc(invoice.jobId).get()).data() ?? {} : {};
        const company = await loadDocumentCompany(db, biz.id, data, invoice, job);
        const business = company ? { ...documentLetterhead(data, company, logos), businessName: company.name } : baseBusiness;
        const email = buildCustomerReminderEmail(invoice, invoiceBalance(invoice), daysPastDue(invoice, now), business, company ? effectiveBillingPrefs(documentLetterhead(data, company, logos)) : prefs, data.timezone);
        const result = await sendEmail({ businessId: biz.id, to, ...email, fromName: business.businessName, replyTo: business.contactEmail || data.notificationEmail });
        if (result.status !== "delivered") { errors.push(`${biz.id}/${doc.id}: reminder not delivered`); continue; }
        await doc.ref.update({ remindersSent: FieldValue.arrayUnion(due), lastReminderAt: now });
        reminded.push(`${biz.id}/${doc.id}:${due}d`);
      }
    } catch (error) {
      errors.push(`${biz.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { reminded, errors };
}

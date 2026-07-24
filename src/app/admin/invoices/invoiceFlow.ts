export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoiceTemplate {
  templateId: string;
  name: string;
  lineItems: LineItem[];
  notes?: string;
}

export interface LuxorInvoice {
  invoiceId: string;
  clientName: string;
  clientEmail: string;
  clientAddress?: string;
  lineItems: LineItem[];
  notes: string;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  status: "draft" | "sent" | "paid";
  dueDate: string;
  createdAt: number;
  sentAt?: number;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidInvoiceEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function canSendSavedInvoice(
  invoiceId: string | null,
  dirty: boolean,
  recipientEmail: string
): boolean {
  return Boolean(invoiceId) && !dirty && isValidInvoiceEmail(recipientEmail);
}

export const UNSAVED_INVOICE_MESSAGE =
  "You have unsaved invoice changes. Leave this page?";

export function guardUnsavedInvoiceUnload(
  event: Pick<BeforeUnloadEvent, "preventDefault" | "returnValue">,
  dirty: boolean
): boolean {
  if (!dirty) return false;
  event.preventDefault();
  event.returnValue = UNSAVED_INVOICE_MESSAGE;
  return true;
}

export type InvoicePageLoadResult =
  | { status: "success"; invoices: LuxorInvoice[]; templates: InvoiceTemplate[] }
  | { status: "error" };

export async function loadInvoicePage(
  fetchImpl: typeof fetch = fetch
): Promise<InvoicePageLoadResult> {
  try {
    const [invoiceResponse, templateResponse] = await Promise.all([
      fetchImpl("/api/admin/invoices"),
      fetchImpl("/api/admin/invoice-templates"),
    ]);
    if (!invoiceResponse.ok || !templateResponse.ok) {
      throw new Error("Invoice data request failed");
    }
    const [invoiceData, templateData] = await Promise.all([
      invoiceResponse.json(),
      templateResponse.json(),
    ]);
    return {
      status: "success",
      invoices: invoiceData.invoices ?? [],
      templates: templateData.templates ?? [],
    };
  } catch {
    return { status: "error" };
  }
}

export async function runSingleFlight(
  lock: { current: boolean },
  action: () => Promise<void>
): Promise<boolean> {
  if (lock.current) return false;
  lock.current = true;
  try {
    await action();
    return true;
  } finally {
    lock.current = false;
  }
}

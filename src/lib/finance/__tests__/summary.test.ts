import { describe, expect, it } from "vitest";
import { rowsFromHistory, rowsFromInvoices, summarizeFinances } from "../summary";
import type { InvoiceHistoryRecord } from "@/types/invoiceHistory";
import type { JobInvoice } from "@/types/invoice";
import type { FinanceRow } from "@/types/finance";
const now = Date.UTC(2026,10,4,12), day = 86400000;
const history = (extra: Partial<InvoiceHistoryRecord> = {}): InvoiceHistoryRecord => ({id:"a",source:"jobba",sourceInvoiceId:"a",issuedAt:now,workName:"Repair",billTo:"Acme",amount:1,tax:0,credits:0,amountDue:1,voided:false,status:"",importedAt:now,...extra});
const row = (extra: Partial<FinanceRow> = {}): FinanceRow => ({invoiceNo:"1",customer:"Acme",issuedAt:now,total:1,balance:1,status:"unpaid",source:"jobba",...extra});
const invoice = (extra: Partial<JobInvoice> = {}): JobInvoice => ({invoiceId:"i",businessId:"b",jobId:"j",billTo:{name:"Acme"},status:"sent",labor:[],materials:[],other:[{lineId:"1",description:"work",amount:10}],hideMaterials:false,taxRate:0,laborSubtotal:0,materialSubtotal:0,otherSubtotal:10,subtotal:10,taxAmount:0,total:10,createdAt:now,updatedAt:now,createdBy:"x",...extra});
describe("finance summary", () => {
  it("counts imported payments without subtracting credits from invoice totals", () => {
    const rows = rowsFromHistory([
      history({ sourceInvoiceId: "paid", amount: 100, tax: 10, credits: 110, amountDue: 0 }),
      history({ sourceInvoiceId: "partial", amount: 100, tax: 10, credits: 40, amountDue: 70 }),
      history({ sourceInvoiceId: "unpaid", amount: 100, tax: 10, amountDue: 110 }),
      history({ sourceInvoiceId: "void", amount: 100, voided: true }),
    ]);
    expect(rows.map(r => [r.total, r.balance, r.status])).toEqual([[110, 0, "paid"], [110, 70, "partly_paid"], [110, 110, "unpaid"]]);
    expect(summarizeFinances(rows, {}, now).totals).toMatchObject({ invoiced: 330, collected: 150, outstanding: 180 });
  });
  it("adds cents exactly", () => expect(summarizeFinances([row({total:.1,balance:.1}),row({total:.2,balance:.2})],{},now).totals.invoiced).toBe(.3));
  it("skips voided history", () => expect(rowsFromHistory([history({voided:true})])).toHaveLength(0));
  it("classifies partial payments", () => expect(rowsFromHistory([history({amountDue:.5})])[0].status).toBe("partly_paid"));
  it("classifies paid", () => expect(rowsFromHistory([history({amountDue:0})])[0].status).toBe("paid"));
  it.each([[0,"current"],[30,"d1_30"],[31,"d31_60"],[60,"d31_60"],[61,"d61_90"],[90,"d61_90"],[91,"d90plus"]] as const)("ages %i days late", (late, bucket) => expect(summarizeFinances([row({issuedAt:now-(30+late)*day})],{},now).aging[bucket]).toBe(1));
  it("respects terms", () => expect(summarizeFinances([row({issuedAt:now-20*day})],{},now,10).totals.pastDue).toBe(1));
  it("handles empty input and twelve zero months", () => { const s=summarizeFinances([],{},now); expect(s.byMonth).toHaveLength(12); expect(s.byMonth.every(m=>m.invoiced===0)).toBe(true); expect(s.totals.outstanding).toBe(0); });
  it("filters customers ignoring case", () => expect(summarizeFinances([row()],{customer:"aCMe"},now).rows).toHaveLength(1));
  it("limits top owing to five", () => expect(summarizeFinances(Array.from({length:6},(_,i)=>row({customer:String(i),balance:i+1,total:i+1})),{},now).topOwing.map(x=>x.customer)).toEqual(["5","4","3","2","1"]));
  it("skips draft and void invoices", () => expect(rowsFromInvoices([invoice({status:"draft"}),invoice({status:"void"})])).toHaveLength(0));
  it("counts deposit invoices", () => expect(rowsFromInvoices([invoice({kind:"deposit"})])[0].total).toBe(10));
});

describe("company attribution (T-317)", () => {
  it("retains an app invoice customer link", () => { expect(rowsFromInvoices([invoice({ customerId: "C-EXAMPLE" })])[0].customerId).toBe("C-EXAMPLE"); });
  it("keeps the matched customerId on imported history rows", () => {
    expect(rowsFromHistory([history({ customerId: "C-1" })])[0].customerId).toBe("C-1");
  });
  it("carries the invoice's own company", () => {
    expect(rowsFromInvoices([invoice({ companyId: "rcu" })])[0].companyId).toBe("rcu");
  });
  it("falls back to the job's company when the invoice has none", () => {
    expect(rowsFromInvoices([invoice({ companyId: undefined })], { j: "rcu" })[0].companyId).toBe("rcu");
  });
  it("leaves companyId off when neither is known (today's shape)", () => {
    expect(rowsFromInvoices([invoice()])[0]).not.toHaveProperty("companyId");
  });
  it("filters one company and recomputes every total", () => {
    const rows = [row({ invoiceNo: "A", companyId: "rdsf", total: 100, balance: 100 }), row({ invoiceNo: "B", companyId: "rcu", total: 25, balance: 25 })];
    const only = summarizeFinances(rows, { company: "rcu" }, now);
    expect(only.rows.map((r) => r.invoiceNo)).toEqual(["B"]);
    expect(only.totals).toMatchObject({ invoiced: 25, outstanding: 25 });
  });
  it("no company filter keeps every row and every total", () => {
    const rows = [row({ invoiceNo: "A", companyId: "rdsf", total: 100, balance: 100 }), row({ invoiceNo: "B", companyId: "rcu", total: 25, balance: 25 })];
    expect(summarizeFinances(rows, {}, now).totals.invoiced).toBe(125);
  });
});

describe("due dates and days late (T-301)", () => {
  const DAY = 86400000, now = Date.UTC(2026, 10, 5, 12);
  const row = (over: Partial<import("@/types/finance").FinanceRow>) => ({ invoiceNo: "X", customer: "Acme", issuedAt: now - 45 * DAY, total: 100, balance: 100, status: "unpaid" as const, source: "app" as const, ...over });
  it("uses issued + terms when the invoice has no due date", () => {
    const s = summarizeFinances([row({})], {}, now, 30);
    expect(s.rows[0].daysLate).toBe(15);
    expect(s.rows[0].dueAt).toBe(now - 15 * DAY);
  });
  it("prefers the invoice's own due date", () => {
    const s = summarizeFinances([row({ dueAt: now - 2 * DAY })], {}, now, 30);
    expect(s.rows[0].daysLate).toBe(2);
    expect(s.aging.d1_30).toBe(100);
  });
  it("a paid or not-yet-due invoice is 0 days late", () => {
    const s = summarizeFinances([row({ balance: 0, status: "paid" }), row({ invoiceNo: "Y", dueAt: now + DAY })], {}, now, 30);
    expect(s.rows.map(r => r.daysLate)).toEqual([0, 0]);
    expect(s.totals.pastDue).toBe(0);
  });
});

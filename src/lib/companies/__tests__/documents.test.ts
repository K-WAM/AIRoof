import { POST as createInvoice } from "@/app/api/jobs/[jobId]/invoice/route";
import { POST as createDeposit } from "@/app/api/jobs/[jobId]/invoice/deposits/route";
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { POST as invoiceSend } from "@/app/api/jobs/[jobId]/invoice/send/route";
import { POST as quoteSend } from "@/app/api/jobs/[jobId]/quote/send/route";
import { POST as payment } from "@/app/api/jobs/[jobId]/invoice/payments/route";
import { runCustomerReminders } from "@/lib/billing/customerReminders";
import { POST as reportSend } from "@/app/api/jobs/[jobId]/report/send/route";
import { PATCH as switchDocument } from "@/app/api/jobs/[jobId]/company/route";
import { PATCH as switchJob } from "@/app/api/jobs/[jobId]/route";
import { claimInvoiceSend, finishInvoiceSend } from "@/lib/billing/jobInvoiceStore";
import { documentLetterhead } from "../documentLetterhead";
import { resolveDocumentCompany } from "../companies";
import { buildJobInvoiceEmailHtml } from "@/lib/billing/jobInvoiceEmailHtml";
import { buildQuoteEmailHtml } from "@/lib/billing/jobQuoteEmailHtml";
import { buildJobReportEmailHtml } from "@/lib/billing/jobReportEmailHtml";
import { resolvedInvoiceCopy, resolvedQuoteNarrative, staleCompanyName } from "../documentCopy";
import { draftQuoteIntro } from "@/lib/billing/draftQuoteIntro";
const mocks=vi.hoisted(()=>({send:vi.fn()}));let db:ReturnType<typeof makeFakeDb>;
vi.mock("@/lib/firebase/admin",()=>({getAdminFirestore:()=>db}));
vi.mock("@/lib/auth/verifyRole",()=>({verifyAuthAndRole:async()=>({user:{uid:"owner",businessId:"biz"}}),verifyOwnBusinessRole:async()=>({user:{uid:"owner",businessId:"biz"}})}));
vi.mock("@/lib/comms/send",()=>({isCommsConfigured:()=>true,sendEmail:mocks.send}));
vi.mock("@/lib/photos/store",()=>({listPhotoMetas:async()=>[],getPhotoBlobs:async()=>({})}));
vi.mock("@/lib/billing/stripePayments",()=>({isStripeConfigured:()=>false}));
const a={id:"rdsf",name:"Roof Pros South",shortName:"RDSF",isDefault:true,payInstructions:"South bank"};
const b={id:"rcu",name:"Concepts <Unlimited>",shortName:"RCU",logoId:"rcu",address:"RCU address",phone:"222",email:"rcu@example.test",license:"RCU-123",payInstructions:"RCU bank",payLink:"https://rcu.example.test/pay"};
const ctx={params:Promise.resolve({jobId:"j"})};
const req=(extra:object={})=>new NextRequest("http://localhost/api/jobs/j/invoice/send",{method:"POST",body:JSON.stringify({businessId:"biz",to:"customer@example.test",...extra})});
function seed(companies?:unknown){
  db.__seed("businesses","biz",{businessName:"Main Company",industry:"roofing",contactEmail:"main@example.test",billingCompanies:companies});
  db.__seed("businesses/biz/library","logos",{logos:[{logoId:"rcu",name:"RCU",b64:"cG5n",mimeType:"image/png",variant:"color",createdAt:1}]});
  db.__seed("businesses/biz/jobs","j",{jobId:"j",businessId:"biz",companyId:companies&&Array.isArray(companies)&&companies.length>1?"rcu":undefined,title:"Repair",clientName:"School",status:"open",invoiceId:"INV-1",quoteId:"Q-1",reportDocument:{layout:"report"}});
  db.__seed("businesses/biz/invoices","INV-1",{invoiceId:"INV-1",businessId:"biz",jobId:"j",status:"draft",billTo:{name:"School"},labor:[],materials:[],other:[{lineId:"work",description:"Repair",amount:100}],taxRate:0,subtotal:100,total:100,createdAt:1,updatedAt:1});
  db.__seed("businesses/biz/quotes","Q-1",{quoteId:"Q-1",businessId:"biz",jobId:"j",status:"draft",billTo:{name:"School"},findings:[],lines:[{lineId:"work",kind:"other",description:"Repair",quantity:1,unitPrice:100}],subtotal:100,total:100,validUntil:Date.now()+86400000,createdAt:1,updatedAt:1});
}
beforeEach(()=>{db=makeFakeDb();mocks.send.mockReset().mockResolvedValue({status:"delivered"});});
it.each([undefined,[a],[a,b]])("sends all document kinds under the resolved company and pins only multi-company documents: %j",async companies=>{
  seed(companies);const multi=(companies?.length??0)>1;
  for(const handler of [invoiceSend,quoteSend,reportSend]) expect((await handler(req(),ctx)).status).toBe(200);
  for(const [email] of mocks.send.mock.calls){expect(email.fromName).toBe(multi?b.name:"Main Company");expect(email.replyTo).toBe(multi?b.email:"main@example.test");if(multi){expect(email.html).toContain("Concepts &lt;Unlimited&gt;");expect(email.html).toContain("RCU address");expect(email.html).toContain("RCU-123");expect(email.html).toContain("data:image/png;base64,cG5n");}}
  expect(db.__peek("businesses/biz/invoices","INV-1")?.companyId).toBe(multi?"rcu":undefined);expect(db.__peek("businesses/biz/quotes","Q-1")?.companyId).toBe(multi?"rcu":undefined);
  const report=db.__peek("businesses/biz/jobs","j")?.reportDocument as {companyId?:string;sentAt?:number};expect(report.companyId).toBe(multi?"rcu":undefined);expect(!!report.sentAt).toBe(multi);
  for(const kind of ["invoice","quote","report"]) expect((await switchDocument(req({kind,companyId:"rdsf"}),ctx)).status).toBe(multi?409:200);
});
it("single-company copy is never rewritten",()=>{
  const business={billingCompanies:[a],industry:"roofing"};
  expect(resolvedInvoiceCopy({closing:"Keep",thankYou:"Keep too",createdAt:1},business,{},"")).toEqual({closing:"Keep",thankYou:"Keep too"});
  expect(resolvedQuoteNarrative({narrative:"Keep",findings:[]},{},business,"")).toBe("Keep");
});
it("switching a deposit's company uses the posted deposit invoice id, not the job's standard invoice",async()=>{
  seed([a,b]);
  db.__seed("businesses/biz/invoices","INV-2",{invoiceId:"INV-2",businessId:"biz",jobId:"j",kind:"deposit",status:"draft",billTo:{name:"School"},labor:[],materials:[],other:[{lineId:"deposit",description:"Deposit",amount:50}],taxRate:0,subtotal:50,total:50,createdAt:1,updatedAt:1});
  expect((await switchDocument(req({kind:"deposit",companyId:"rdsf",invoiceId:"INV-2"}),ctx)).status).toBe(200);
  expect(db.__peek("businesses/biz/invoices","INV-2")?.companyId).toBe("rdsf");
  expect(db.__peek("businesses/biz/invoices","INV-1")?.companyId).toBeUndefined();
});
it.each([invoiceSend,quoteSend,reportSend])("a failed delivery leaves a draft following the job",async handler=>{
  seed([a,b]);mocks.send.mockResolvedValue({status:"failed"});expect((await handler(req(),ctx)).status).toBe(502);
  expect(db.__peek("businesses/biz/invoices","INV-1")?.companyId).toBeUndefined();expect(db.__peek("businesses/biz/quotes","Q-1")?.companyId).toBeUndefined();expect((db.__peek("businesses/biz/jobs","j")?.reportDocument as {companyId?:string}).companyId).toBeUndefined();
});
it("the send claim freezes the delivered company even if the job is switched during delivery",async()=>{
  seed([a,b]);mocks.send.mockImplementation(async()=>{await db.collection("businesses/biz/jobs").doc("j").update({companyId:"rdsf"});return {status:"delivered"};});
  expect((await invoiceSend(req(),ctx)).status).toBe(200);expect(db.__peek("businesses/biz/invoices","INV-1")?.companyId).toBe("rcu");
});
it("deposit claims also freeze only on successful send, never on failed send",async()=>{
  seed([a,b]);await db.collection("businesses/biz/invoices").doc("INV-1").update({kind:"deposit"});
  const first=await claimInvoiceSend(db as never,"biz","j","INV-1");expect(db.__peek("businesses/biz/invoices","INV-1")?.companyId).toBeUndefined();await finishInvoiceSend(db as never,"biz","j","INV-1",first.token,"customer@example.test","owner",false);
  const second=await claimInvoiceSend(db as never,"biz","j","INV-1");await finishInvoiceSend(db as never,"biz","j","INV-1",second.token,"customer@example.test","owner",true);expect(db.__peek("businesses/biz/invoices","INV-1")?.companyId).toBe("rcu");
});
it("single-company email HTML is byte-for-byte unchanged by the letterhead helper",()=>{
  seed([a]);const business={businessName:"Main Company",contactEmail:"main@example.test"};const brand=documentLetterhead(business,null);const invoice=db.__peek("businesses/biz/invoices","INV-1")!;const quote=db.__peek("businesses/biz/quotes","Q-1")!;
  expect(buildJobInvoiceEmailHtml(invoice as never,brand)).toBe(buildJobInvoiceEmailHtml(invoice as never,business));expect(buildQuoteEmailHtml(quote as never,brand)).toBe(buildQuoteEmailHtml(quote as never,business));
  const input={business,logos:[],jobId:"j",title:"Repair",billTo:{name:"School"}};expect(buildJobReportEmailHtml({...input,business:brand})).toBe(buildJobReportEmailHtml(input));expect(resolveDocumentCompany({billingCompanies:[a]},{})).toBeNull();
});

it.each(["proposal", "tm_authorization", "inspection_completion", "repair_completion"])("%s letters use the company identity",async layout=>{
  seed([a,b]);const report=layout.endsWith("completion");
  if(report) await db.collection("businesses/biz/jobs").doc("j").update({reportDocument:{layout}});
  else await db.collection("businesses/biz/quotes").doc("Q-1").update({layout});
  expect((await (report?reportSend:quoteSend)(req(),ctx)).status).toBe(200);const email=mocks.send.mock.calls[0][0];expect(email.html).toContain("Concepts &lt;Unlimited&gt;");expect(email.html).toContain("RCU-123");expect(email.fromName).toBe(b.name);
});
it("a company switch regenerates generated invoice text, keeps edited text, and the email names only the new company",async()=>{
  seed([a,b]);
  await db.collection("businesses/biz/jobs").doc("j").update({invoiceId:undefined,address:"12 Palm Way",clientName:"School"});
  db.__seed("businesses/biz/documentTemplates","invoice_opening",{kind:"invoice_opening",title:"Opening",sections:[{id:"opening",body:"{{business.name}} completed the work."}],updatedAt:1});
  const created=await createInvoice(req(),ctx);expect(created.status).toBe(201);const invoiceId=(await created.json()).invoice.invoiceId as string;
  await db.collection("businesses/biz/invoices").doc(invoiceId).update({other:[{lineId:"work",description:"Repair",amount:100}],subtotal:100,total:100});
  const invoice=db.__peek("businesses/biz/invoices",invoiceId)!;
  expect(invoice.opening).toContain(b.name);expect(invoice.thankYou).toContain(b.name);
  expect((await switchDocument(req({kind:"invoice",companyId:"rdsf"}),ctx)).status).toBe(200);
  const switched=db.__peek("businesses/biz/invoices",invoiceId)!;
  expect(switched.opening).toContain(a.name);expect(switched.opening).not.toContain(b.name);
  expect(String(switched.thankYou)).toContain(a.name);expect(String(switched.thankYou)).not.toContain(b.name);
  mocks.send.mockClear();expect((await invoiceSend(req(),ctx)).status).toBe(200);const html=mocks.send.mock.calls[0][0].html;
  expect(html).toContain(a.name);expect(html).toContain("South bank");expect(html).not.toContain("Concepts &lt;Unlimited&gt;");expect(html).not.toContain("RCU bank");
});
it("a JOB company switch also clears the old name from a draft invoice's generated opening and email",async()=>{
  seed([a,b]);
  await db.collection("businesses/biz/jobs").doc("j").update({invoiceId:undefined,address:"12 Palm Way",clientName:"School"});
  db.__seed("businesses/biz/documentTemplates","invoice_opening",{kind:"invoice_opening",title:"Opening",sections:[{id:"opening",body:"{{business.name}} completed the work."}],updatedAt:1});
  const created=await createInvoice(req(),ctx);expect(created.status).toBe(201);const invoiceId=(await created.json()).invoice.invoiceId as string;
  await db.collection("businesses/biz/invoices").doc(invoiceId).update({other:[{lineId:"work",description:"Repair",amount:100}],subtotal:100,total:100});
  expect(db.__peek("businesses/biz/invoices",invoiceId)?.opening).toContain(b.name);
  expect((await switchJob(req({companyId:"rdsf"}),{params:Promise.resolve({jobId:"j"})})).status).toBe(200);
  mocks.send.mockClear();expect((await invoiceSend(req(),ctx)).status).toBe(200);const email=mocks.send.mock.calls[0][0];
  expect(email.html).toContain(a.name);expect(email.html).not.toContain("Concepts &lt;Unlimited&gt;");
});
it("a company switch regenerates the quote intro that still equals the generated default",async()=>{
  seed([a,b]);db.__seed("businesses/biz/quotes","Q-1",{quoteId:"Q-1",businessId:"biz",jobId:"j",status:"draft",billTo:{name:"School"},findings:[{findingId:"f",problem:"Leak",solution:"Repair",includeInQuote:true}],lines:[{lineId:"work",kind:"other",description:"Repair",quantity:1,unitPrice:100}],subtotal:100,total:100,validUntil:Date.now()+86400000,createdAt:1,updatedAt:1});
  const job=db.__peek("businesses/biz/jobs","j")!;const quote=db.__peek("businesses/biz/quotes","Q-1")!;
  await db.collection("businesses/biz/quotes").doc("Q-1").update({narrative:draftQuoteIntro(job as never,quote.findings as never,b.name)});
  expect((await switchDocument(req({kind:"quote",companyId:"rdsf"}),ctx)).status).toBe(200);
  const narrative=db.__peek("businesses/biz/quotes","Q-1")?.narrative as string;
  expect(narrative).toContain(a.name);expect(narrative).not.toContain(b.name);
  // Staff-edited wording is kept, and the draft can warn that it still names the other company.
  await db.collection("businesses/biz/quotes").doc("Q-1").update({narrative:`Thanks from ${b.name}.`});
  expect((await switchDocument(req({kind:"quote",companyId:"rdsf"}),ctx)).status).toBe(200);
  const edited=String(db.__peek("businesses/biz/quotes","Q-1")?.narrative);
  expect(edited).toBe(`Thanks from ${b.name}.`);expect(staleCompanyName(edited,[a,b],"rdsf")).toBe(b.name);
});
it("refuses to send an invoice under a company with no payment details instead of printing another company's bank",async()=>{
  const bare={id:"bare",name:"Bare Company",shortName:"BARE",address:"Bare address"};
  seed([a,b,bare]);expect((await switchDocument(req({kind:"invoice",companyId:"bare"}),ctx)).status).toBe(200);
  mocks.send.mockClear();const res=await invoiceSend(req(),ctx);
  expect(res.status).toBe(409);expect((await res.json()).error).toBe("Add BARE's payment details first (Library → Branding).");
  expect(mocks.send).not.toHaveBeenCalled();
});
it("an invoice override takes priority over the job and the deposit email uses the right bank",async()=>{
  seed([a,b]);expect((await switchDocument(req({kind:"invoice",companyId:"rdsf"}),ctx)).status).toBe(200);
  expect((await invoiceSend(req(),ctx)).status).toBe(200);expect(mocks.send.mock.calls[0][0].fromName).toBe(a.name);
  seed([a,b]);await db.collection("businesses/biz/invoices").doc("INV-1").update({kind:"deposit"});mocks.send.mockClear();expect((await invoiceSend(req({invoiceId:"INV-1"}),ctx)).status).toBe(200);expect(mocks.send.mock.calls[0][0].html).toContain("RCU bank");expect(mocks.send.mock.calls[0][0].html).not.toContain("South bank");
});
it.each([undefined,[a],[a,b]])("receipts and overdue reminders use the frozen company and preserve single-company behavior: %j",async companies=>{
  seed(companies);const multi=(companies?.length??0)>1;
  await db.collection("businesses/biz/invoices").doc("INV-1").update({status:"sent",...(multi?{companyId:"rcu"}:{}),sentTo:"customer@example.test",dueAt:Date.now()-2*86400000});
  await db.collection("businesses/biz/jobs").doc("j").update({companyId:multi?"rdsf":undefined});
  expect((await payment(req({amount:20,method:"check"}),ctx)).status).toBe(200);expect(mocks.send.mock.calls[0][0].fromName).toBe(multi?b.name:"Main Company");
  await db.collection("businesses").doc("biz").update({billingPrefs:{remindersOn:true}});
  const collection=db.collection.bind(db);vi.spyOn(db,"collection").mockImplementation(name=>Object.assign(collection(name),{select(){return this;}}));
  mocks.send.mockClear();const result=await runCustomerReminders(db as never);expect(result.errors).toEqual([]);expect(result.reminded).toHaveLength(1);expect(mocks.send.mock.calls[0][0].fromName).toBe(multi?b.name:"Main Company");if(multi){expect(mocks.send.mock.calls[0][0].html).toContain("RCU bank");expect(mocks.send.mock.calls[0][0].html).toContain("RCU address");}
});

it.each([undefined,[a],[a,b]])("generated invoice and deposit openings use the resolved name without pinning a draft: %j",async companies=>{
  seed(companies);const multi=(companies?.length??0)>1;
  await db.collection("businesses/biz/jobs").doc("j").update({invoiceId:undefined});
  for (const kind of ["invoice_opening", "deposit_opening"]) db.__seed("businesses/biz/documentTemplates", kind, { kind, title: "Opening", sections: [{ id: "opening", body: "{{business.name}} completed the work." }], updatedAt: 1, updatedBy: "owner" });
  const created=await createInvoice(req(),ctx);expect(created.status).toBe(201);const invoice=(await created.json()).invoice;expect(invoice.opening).toContain(multi?b.name:"Main Company");expect(invoice.companyId).toBeUndefined();
  const deposit=await createDeposit(req({requestId:"t316-deposit-creation",basis:100,percent:50}),ctx);expect(deposit.status).toBe(201);const doc=(await deposit.json()).invoice;expect(doc.opening).toContain(multi?b.name:"Main Company");expect(doc.companyId).toBeUndefined();
});

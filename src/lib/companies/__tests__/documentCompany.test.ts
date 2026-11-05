import { expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { loadDocumentCompany } from "../documentCompany";
const a={id:"rdsf",name:"Roof Pros South",shortName:"RDSF",isDefault:true},b={id:"rcu",name:"Concepts Unlimited",shortName:"RCU"};
it.each([{}, {billingCompanies:[a]}])("single-company resolution does no extra read: %j",async business=>{const db=makeFakeDb();const spy=vi.spyOn(db,"collection");expect(await loadDocumentCompany(db as never,"a",business,{companyId:"rcu"},{customerId:"foreign"})).toBeNull();expect(spy).not.toHaveBeenCalled();});
it("resolves known document, job, customer, default; reads only the tenant's own customer",async()=>{
  const db=makeFakeDb();db.__seed("businesses/a/customers","C-1",{companyId:"rcu"});db.__seed("businesses/b/customers","foreign",{companyId:"rcu"});const business={billingCompanies:[a,b]};
  expect((await loadDocumentCompany(db as never,"a",business,{companyId:"rdsf"},{companyId:"rcu",customerId:"C-1"}))?.id).toBe("rdsf");
  expect((await loadDocumentCompany(db as never,"a",business,undefined,{companyId:"rcu",customerId:"C-1"}))?.id).toBe("rcu");
  expect((await loadDocumentCompany(db as never,"a",business,undefined,{customerId:"C-1"}))?.id).toBe("rcu");
  expect((await loadDocumentCompany(db as never,"a",business,undefined,{customerId:"foreign"}))?.id).toBe("rdsf");
});

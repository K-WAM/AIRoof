// @vitest-environment jsdom
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { expect, it } from "vitest";
import { documentLetterhead } from "../documentLetterhead";
import { resolveDocumentCompany } from "../companies";
import { DocumentPreview } from "@/lib/documents/DocumentPreview";
import { PrivateDemoDocuments } from "@/components/demo/PrivateDemoDocuments";
function markup(element: ReactElement) { const view = render(element); const html = view.container.innerHTML; view.unmount(); return html; }
const a={id:"rdsf",name:"Roof Pros South",shortName:"RDSF",isDefault:true},b={id:"rcu",name:"Concepts Unlimited",shortName:"RCU",address:"RCU address",license:"RCU-1"};
it("draft and print previews follow the job and sent previews use the document's own company",()=>{
  const business={billingCompanies:[a,b],businessName:"Main"};
  for(const documentCompanyId of [undefined,"rdsf"]){const company=resolveDocumentCompany(business,{documentCompanyId,jobCompanyId:"rcu"});const html=markup(<DocumentPreview title="Invoice" brand={documentLetterhead(business,company)} meta={[]} billTo={{name:"School"}}/>);expect(html).toContain(documentCompanyId?a.name:b.name);expect(html).not.toContain(documentCompanyId?b.name:a.name);}
});
it("private demo previews also preserve single-company markup",()=>{
  const job={jobId:"J-1",title:"Repair",companyId:"rcu"};const business={businessName:"Main"};
  const before=markup(<PrivateDemoDocuments job={job as never} business={business as never} kind="report"/>);
  expect(markup(<PrivateDemoDocuments job={job as never} business={{...business,billingCompanies:[a]} as never} kind="report"/>)).toBe(before);
  expect(markup(<PrivateDemoDocuments job={job as never} business={{...business,billingCompanies:[a,b]} as never} kind="report"/>)).toContain(b.name);
});

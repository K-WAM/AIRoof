// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentCompanyControl } from "./DocumentCompanyControl";
const state=vi.hoisted(()=>({companies:undefined as unknown}));
vi.mock("@/contexts/BootstrapContext",()=>({useBootstrap:()=>({data:{business:{companies:state.companies}}})}));
vi.mock("@/hooks/useBusinessId",()=>({useBusinessId:()=>"biz"}));
const a={id:"rdsf",name:"Roof Pros South",shortName:"RDSF",isDefault:true,logoUrl:null},b={id:"rcu",name:"Concepts Unlimited",shortName:"RCU",isDefault:false,logoUrl:null};
beforeEach(()=>vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true})})));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it.each([undefined,[],[a]])("single-company document toolbar adds no UI, request or saved field: %j",companies=>{state.companies=companies;const onSaved=vi.fn();const view=render(<DocumentCompanyControl jobId="j" kind="invoice" onSaved={onSaved}/>);expect(view.container.innerHTML).toBe("");expect(fetch).not.toHaveBeenCalled();expect(onSaved).not.toHaveBeenCalled();});
it("drafts follow the job and a menu switch saves only the document override, never a second radiogroup",async()=>{state.companies=[a,b];const onSaved=vi.fn();render(<DocumentCompanyControl jobId="j" kind="invoice" jobCompanyId="rcu" onSaved={onSaved}/>);
  expect(screen.queryByRole("radiogroup")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:/Issued as RCU/}));
  fireEvent.click(screen.getByRole("menuitem",{name:/RDSF/}));
  await waitFor(()=>expect(onSaved).toHaveBeenCalledWith("rdsf",undefined));
  expect(fetch).toHaveBeenCalledWith("/api/jobs/j/company",expect.objectContaining({body:JSON.stringify({businessId:"biz",kind:"invoice",companyId:"rdsf"})}));
});
it("a sent document only states its company and offers no control",()=>{state.companies=[a,b];render(<DocumentCompanyControl jobId="j" kind="invoice" companyId="rcu" sent onSaved={vi.fn()}/>);expect(screen.getByText("Sent as RCU")).toBeTruthy();expect(screen.queryByRole("button")).toBeNull();});

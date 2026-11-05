// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentCompanyControl } from "./DocumentCompanyControl";
const state=vi.hoisted(()=>({companies:undefined as unknown}));
vi.mock("@/contexts/BootstrapContext",()=>({useBootstrap:()=>({data:{business:{companies:state.companies}}})}));
const a={id:"rdsf",name:"Roof Pros South",shortName:"RDSF",isDefault:true,logoUrl:null},b={id:"rcu",name:"Concepts Unlimited",shortName:"RCU",isDefault:false,logoUrl:null};
beforeEach(()=>vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true})})));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it.each([undefined,[],[a]])("single-company document toolbar adds no UI, request or saved field: %j",companies=>{state.companies=companies;const onSaved=vi.fn();const view=render(<DocumentCompanyControl jobId="j" kind="invoice" onSaved={onSaved}/>);expect(view.container.innerHTML).toBe("");expect(fetch).not.toHaveBeenCalled();expect(onSaved).not.toHaveBeenCalled();});
it("drafts follow the job and a switch saves only the document override",async()=>{state.companies=[a,b];const onSaved=vi.fn();render(<DocumentCompanyControl jobId="j" kind="invoice" jobCompanyId="rcu" onSaved={onSaved}/>);expect(screen.getByRole("radio",{name:"RCU"}).getAttribute("aria-checked")).toBe("true");fireEvent.click(screen.getByRole("radio",{name:"RDSF"}));await waitFor(()=>expect(onSaved).toHaveBeenCalledWith("rdsf"));expect(fetch).toHaveBeenCalledWith("/api/jobs/j/company",expect.objectContaining({body:JSON.stringify({kind:"invoice",companyId:"rdsf"})}));});

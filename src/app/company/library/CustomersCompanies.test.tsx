// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CustomersSection } from "./CustomersSection";
import type { CustomerSlim } from "@/types/customer";
const state=vi.hoisted(()=>({companies:undefined as unknown}));
vi.mock("@/contexts/BootstrapContext",()=>({useBootstrap:()=>({data:{business:{companies:state.companies}}})}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({user:{role:"owner"}})}));
vi.mock("@/hooks/useBusinessModules",()=>({useBusinessModules:()=>({vocab:{customerNoun:"Customer",customerNounPlural:"Customers",jobNoun:"Job",jobNounPlural:"Jobs"}})}));
vi.mock("@/hooks/useBusinessTimezone",()=>({useBusinessTimezone:()=>"America/New_York"}));
const a={id:"rdsf",name:"Roof Pros South",shortName:"RDSF",isDefault:true,logoUrl:null},b={id:"rcu",name:"Concepts Unlimited",shortName:"RCU",isDefault:false,logoUrl:null};
const customers:CustomerSlim[]=[{customerId:"C-1",name:"Existing",kind:"commercial",jobCount:1}];
beforeEach(()=>vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({customer:{customerId:"C-2",name:"New school",kind:"commercial",jobCount:0}})})));
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals();});
it.each([undefined,[a],[a,b]])("customer create keeps the single-company payload and default or chosen company: %j",async companies=>{
  state.companies=companies;render(<CustomersSection businessId="biz" customers={customers} setCustomers={vi.fn()} />);
  fireEvent.click(screen.getByRole("button",{name:"New customer"}));
  const multi=(companies?.length??0)>1;
  if(multi){expect(screen.getByRole("radio",{name:"RDSF"}).getAttribute("aria-checked")).toBe("true");fireEvent.click(screen.getByRole("radio",{name:"RCU"}));}
  else expect(screen.queryByRole("radiogroup",{name:"Company"})).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Name *"),{target:{value:"New school"}});
  const panel=screen.getByRole("heading",{name:"New Customer"}).closest("section")!;
  fireEvent.click(within(panel).getByRole("button",{name:"Add customer"}));
  await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));
  const payload=JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(payload.companyId).toBe(multi?"rcu":undefined);
});

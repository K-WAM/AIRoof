// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(()=>({
  user: {uid:"u1",email:"client@example.test",businessId:"sample",role:"owner",superadmin:false,viewAs:undefined as unknown},
  pathname:"/company/guide", search:"", loading:false,
}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({user:state.loading?null:state.user,loading:state.loading,idToken:null})}));
vi.mock("@/contexts/BootstrapContext",()=>({useBootstrap:()=>({data:{business:{showcase:{finances:true,payroll:true}}}})}));
vi.mock("@/hooks/useBusinessModules",()=>({useBusinessModules:()=>({isEnabled:()=>true,ready:true})}));
vi.mock("next/navigation",()=>({usePathname:()=>state.pathname,useSearchParams:()=>new URLSearchParams(state.search)}));
vi.mock("next/link",()=>({default:({href,children,...rest}:{href:string;children:React.ReactNode})=><a href={href} {...rest}>{children}</a>}));
import { AdminNav } from "@/app/admin/admin-nav";
import { CompanyNav } from "@/app/company/company-nav";
import { CompanySectionNav } from "@/app/company/CompanySectionNav";

afterEach(cleanup);
beforeEach(()=>{state.user.role="owner";state.user.superadmin=false;state.user.viewAs=undefined;state.search="";state.pathname="/company/guide";state.loading=false;});
describe("Help and feedback",()=>{
  it("admin navigation still offers feedback to client users only",()=>{
    const view=render(<AdminNav/>);expect(screen.getByRole("button",{name:"Send feedback"})).toBeInTheDocument();view.unmount();
    state.user.superadmin=true;render(<AdminNav/>);expect(screen.queryByRole("button",{name:"Send feedback"})).toBeNull();
  });
  it("the company menu has one Help destination and preserves Preview",()=>{
    state.search="preview=e2e-roofpros";render(<CompanyNav/>);
    expect(screen.getByRole("link",{name:"Help"})).toHaveAttribute("href","/company/guide?preview=e2e-roofpros");
    expect(screen.queryByRole("button",{name:"Send feedback"})).toBeNull();
    for(const label of ["Calls","Pipeline","Payroll","Billing","Team","Field"])expect(screen.queryByRole("link",{name:label})).toBeNull();
  });
  it("client feedback opens from Help",()=>{
    const open=vi.fn();render(<CompanySectionNav onOpenFeedback={open}/>);
    fireEvent.click(screen.getByRole("button",{name:"Send feedback"}));expect(open).toHaveBeenCalledOnce();
  });
  it("View as keeps feedback visible and disabled with an explanation",()=>{
    state.user.viewAs={uid:"sample"};render(<CompanySectionNav onOpenFeedback={vi.fn()}/>);
    expect(screen.getByRole("button",{name:/Send feedback/})).toBeDisabled();
    expect(screen.getByText("Not available while viewing as someone else")).toBeVisible();
  });
  it("superadmin feedback still needs Preview, and never flashes while loading",()=>{
    state.user.superadmin=true;const view=render(<CompanySectionNav onOpenFeedback={vi.fn()}/>);
    expect(screen.queryByRole("button",{name:"Send feedback"})).toBeNull();view.unmount();
    state.search="preview=e2e-roofpros";const preview=render(<CompanySectionNav onOpenFeedback={vi.fn()}/>);expect(screen.getByRole("button",{name:"Send feedback"})).toBeVisible();preview.unmount();
    state.loading=true;render(<CompanySectionNav onOpenFeedback={vi.fn()}/>);expect(screen.queryByRole("button",{name:"Send feedback"})).toBeNull();
  });
  it("Calls marks Requests active and offers the top switch",()=>{
    state.pathname="/company/calls";render(<><CompanyNav/><CompanySectionNav onOpenFeedback={vi.fn()}/></>);
    expect(screen.getAllByRole("link",{name:"Requests"})[0]).toHaveAttribute("aria-current","page");
    expect(screen.getByRole("navigation",{name:"Requests sections"})).toHaveTextContent("Calls");
  });
  it("staff cannot see Team or showcase children in the switches",()=>{
    state.user.role="staff";state.pathname="/company/team";const view=render(<CompanySectionNav onOpenFeedback={vi.fn()}/>);
    expect(screen.queryByRole("link",{name:"Team"})).toBeNull();view.unmount();state.pathname="/company/billing";
    render(<CompanySectionNav onOpenFeedback={vi.fn()}/>);expect(screen.getByRole("link",{name:"Invoices"})).toBeVisible();expect(screen.queryByRole("link",{name:"Payroll"})).toBeNull();
    state.user.role="owner";
  });
});

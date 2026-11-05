// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CompanyToggle } from "./CompanyToggle";
const a={id:"rdsf",name:"Roof Pros South",shortName:"RDSF",isDefault:true,logoUrl:null};
const b={id:"rcu",name:"Concepts Unlimited",shortName:"RCU",isDefault:false,logoUrl:"data:image/png;base64,a"};
afterEach(cleanup);
it.each([undefined,[],[a]])("single-company adds no element or event: %j",companies=>{const cb=vi.fn();const view=render(<CompanyToggle companies={companies} onChange={cb} />);expect(view.container.innerHTML).toBe("");expect(cb).not.toHaveBeenCalled();});
it("supports arrow keys, wrapping and a single tab stop",()=>{const cb=vi.fn();render(<CompanyToggle companies={[a,b]} onChange={cb} />);const radios=screen.getAllByRole("radio");expect(radios.map(r=>r.tabIndex)).toEqual([0,-1]);fireEvent.keyDown(radios[0],{key:"ArrowLeft"});expect(cb).toHaveBeenCalledWith("rcu");expect(document.activeElement).toBe(radios[1]);expect(screen.getByRole("radiogroup").getAttribute("aria-label")).toBe("Company");});
it("sent documents have a fixed label and no switch",()=>{render(<CompanyToggle companies={[a,b]} value="rcu" readOnly />);expect(screen.queryByRole("radiogroup")).toBeNull();expect(screen.getByText("Sent as RCU")).toBeTruthy();});
it("the job header shows the visible Company label and is named for the job",()=>{render(<CompanyToggle companies={[a,b]} label="Company" ariaLabel="Company for this job" />);expect(screen.getByText("Company")).toBeTruthy();expect(screen.getByRole("radiogroup").getAttribute("aria-label")).toBe("Company for this job");});

it("focusing the already selected option does not pin or resave a draft",()=>{const cb=vi.fn();render(<CompanyToggle companies={[a,b]} onChange={cb}/>);fireEvent.keyDown(screen.getByRole("radio",{name:"RDSF"}),{key:"Home"});expect(cb).not.toHaveBeenCalled();});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CompanyBrand, OtherCompanyBrand } from "./CompanyBrand";
import type { CompanyBootstrap } from "@/types/bootstrap";
// eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
vi.mock("next/image",()=>({default:({priority:_priority,...props}:object & {priority?:boolean})=><img {...props} />}));
afterEach(cleanup);
const base={businessName:"Main",logoUrl:"https://example.test/logo.png"} as CompanyBootstrap["business"];
const a={id:"rdsf",name:"Roof Pros South",shortName:"RDSF",isDefault:true,logoUrl:"data:image/png;base64,a"},b={id:"rcu",name:"Concepts Unlimited",shortName:"RCU",isDefault:false,logoUrl:"data:image/png;base64,b"};
it("single-company markup is identical to today's business brand",()=>{const first=render(<CompanyBrand business={base}/>);const html=first.container.innerHTML;first.unmount();const second=render(<CompanyBrand business={{...base,companies:[a]}}/>);expect(second.container.innerHTML).toBe(html);});
it("places the default and other company in separate brand areas",()=>{const business={...base,companies:[b,a]}; render(<><CompanyBrand business={business}/><OtherCompanyBrand business={business}/></>);expect(screen.getAllByRole("img").map(e=>e.getAttribute("alt"))).toEqual(["Roof Pros South logo","Concepts Unlimited logo"]);});

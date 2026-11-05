import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { GET } from "./route";
let db: ReturnType<typeof makeFakeDb>;
vi.mock("@/lib/firebase/admin", () => ({getAdminFirestore:()=>db}));
vi.mock("@/lib/auth/verifyRole", () => ({verifyAuthAndRole:async()=>({user:{businessId:"a"}})}));
vi.mock("@/lib/comms/sms",()=>({isSmsEnabled:()=>false}));
const a={id:"rdsf",name:"Roof Pros South",shortName:"RDSF",isDefault:true};
beforeEach(()=>{db=makeFakeDb();});
it.each([undefined,[a]])("single-company bootstrap does not read logos or add fields: %j",async billingCompanies=>{
  db.__seed("businesses","a",{businessName:"A",billingCompanies});const spy=vi.spyOn(db,"collection");
  const res=await GET(new NextRequest("http://localhost/api/company/bootstrap?businessId=a"));
  expect((await res.json()).business).not.toHaveProperty("companies");expect(spy.mock.calls).toEqual([["businesses"]]);expect(res.headers.get("cache-control")).toContain("private");
});
it("includes only the bootstrap branding fields for multi-company",async()=>{
  db.__seed("businesses","a",{billingCompanies:[a,{id:"rcu",name:"Concepts Unlimited",shortName:"RCU",payInstructions:"PRIVATE BANK"}]});
  const res=await GET(new NextRequest("http://localhost/api/company/bootstrap?businessId=a"));const body=await res.json();expect(body.business.companies).toHaveLength(2);expect(JSON.stringify(body)).not.toContain("PRIVATE BANK");
});

import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { POST } from "../route";
import { POST as fromRequest } from "../from-request/route";
import { PATCH } from "../[jobId]/route";
const state=vi.hoisted(()=>({role:"owner"}));let db:ReturnType<typeof makeFakeDb>;
vi.mock("@/lib/firebase/admin",()=>({getAdminFirestore:()=>db}));
vi.mock("@/lib/auth/verifyRole",()=>({verifyAuthAndRole:async(_r:unknown,_b:unknown,roles:string[])=>roles.includes(state.role)?{user:{uid:"u",role:state.role}}:{error:NextResponse.json({error:"Forbidden"},{status:403})},verifyFieldAccess:vi.fn()}));
vi.mock("next/server",async original=>({...await original<typeof import("next/server")>(),after:()=>{}}));
const a={id:"rdsf",name:"Roof Pros South",shortName:"RDSF",isDefault:true},b={id:"rcu",name:"Concepts Unlimited",shortName:"RCU"};
const req=(body:unknown)=>new NextRequest("http://localhost/api/jobs",{method:"POST",body:JSON.stringify({businessId:"biz",...body as object})});
const context={params:Promise.resolve({jobId:"J-1000"})};
beforeEach(()=>{db=makeFakeDb();state.role="owner";});
it("viewers and crew cannot change a job's company",async()=>{for(const role of ["viewer","crew"]){state.role=role;expect((await PATCH(req({companyId:"rcu"}),context)).status).toBe(403);}});
it.each([undefined,[a],[a,b]])("both creators and job edits preserve single-company shape: %j",async billingCompanies=>{
  db.__seed("businesses","biz",{billingCompanies});const multi=(billingCompanies?.length??0)>1;
  db.__seed("businesses/biz/customers","C-1",{companyId:"rcu",name:"School",matchKey:"school|"});
  const response=await POST(req({title:"Work",customerId:"C-1"}));expect(response.status).toBe(201);const job=(await response.json()).job;
  expect(job.companyId).toBe(multi?"rcu":undefined);
  expect((await PATCH(req({companyId:"rdsf"}),{params:Promise.resolve({jobId:job.jobId})})).status).toBe(200);
  expect(db.__peek("businesses/biz/jobs",job.jobId)?.companyId).toBe(multi?"rdsf":undefined);
  expect(db.__list(`businesses/biz/jobs/${job.jobId}/auditEvents`)).toHaveLength(multi?1:0);
  db.__seed("businesses/biz/leads","L-1",{companyId:"rcu",serviceType:"Repair"});
  const converted=await fromRequest(req({leadId:"L-1"}));expect(converted.status).toBe(201);expect((await converted.json()).job.companyId).toBe(multi?"rcu":undefined);
  if(multi) { const typed=await POST(req({title:"Typed customer",clientName:"school"}));expect((await typed.json()).job).toMatchObject({companyId:"rcu",customerId:"C-1"}); }
  const explicit=await POST(req({title:"Explicit",customerId:"C-1",companyId:"rdsf"}));expect((await explicit.json()).job.companyId).toBe(multi?"rdsf":undefined);
});

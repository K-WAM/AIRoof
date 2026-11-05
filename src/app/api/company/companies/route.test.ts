import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { GET, PATCH } from "./route";
import { GET as adminGet, PUT } from "@/app/api/admin/businesses/[businessId]/companies/route";
const state = vi.hoisted(() => ({ role: "owner" as string, db: null as unknown }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyOwnBusinessRole: async (_req: unknown, roles: string[]) => roles.includes(state.role) ? { user: { uid: "u", businessId: "a", role: state.role } } : { error: NextResponse.json({error:"Forbidden"}, {status:403}) },
  verifySuperadmin: async () => state.role === "superadmin" ? { user: { uid: "admin" } } : { error: NextResponse.json({error:"Forbidden"}, {status:403}) },
}));
const a = { id:"rdsf", name:"Roof Pros South", shortName:"RDSF", isDefault:true };
const b = { id:"rcu", name:"Concepts Unlimited", shortName:"RCU", logoId:"logo" };
let db: ReturnType<typeof makeFakeDb>;
const req = (method = "GET", companies?: unknown) => new NextRequest("http://localhost/api/company/companies?businessId=b", {method, ...(method !== "GET" ? {body:JSON.stringify({businessId:"b",companies})} : {})});
beforeEach(() => { state.role="owner"; db=makeFakeDb(); state.db=db; db.__seed("businesses","a",{billingCompanies:[a,b]}); db.__seed("businesses","b",{businessName:"SECRET"}); db.__seed("businesses/a/library","logos",{logos:[{logoId:"logo"}]}); });
describe("companies routes", () => {
  it("refuses nonowners' writes and nonadmins' config access", async () => {
    for (const role of ["staff","viewer","crew",""]) { state.role=role; expect((await PATCH(req("PATCH",[]))).status).toBe(403); }
    state.role="owner"; expect((await PUT(req("PUT",[a,b]),{params:Promise.resolve({businessId:"a"})})).status).toBe(403);
  });
  it("takes the owner's business from the session, with private reads", async () => {
    const res=await GET(req()); expect(JSON.stringify(await res.json())).not.toContain("SECRET"); expect(res.headers.get("cache-control")).toContain("private");
    expect((await PATCH(req("PATCH",[{id:a.id},{id:b.id,address:"  Main St  "}]))).status).toBe(200);
    expect((db.__peek("businesses","a")!.billingCompanies as Array<typeof b & {address?:string}>)[1].address).toBe("Main St"); expect(db.__peek("businesses","b")).toEqual({businessName:"SECRET"});
  });
  it("refuses profile structure changes and foreign logos", async () => {
    for(const companies of [[{id:a.id},{id:b.id,isDefault:true}],[{id:a.id},{id:b.id,logoId:"foreign"}],[]]) expect((await PATCH(req("PATCH",companies))).status).toBe(400);
  });
  it("single-company writes store nothing and GET exposes no profile UI data", async () => {
    db.__seed("businesses","a",{billingCompanies:[a]}); const before=db.__peek("businesses","a");
    expect(await (await GET(req())).json()).toEqual({companies:[]}); expect((await PATCH(req("PATCH",[{id:a.id,address:"New"}]))).status).toBe(409); expect(db.__peek("businesses","a")).toEqual(before);
  });
  it("admin saves are audited atomically and cannot delete companies", async () => {
    state.role="superadmin"; const context={params:Promise.resolve({businessId:"a"})};
    expect((await PUT(req("PUT",[a]),context)).status).toBe(400);
    expect((await PUT(req("PUT",[a,{...b,address:"New"}]),context)).status).toBe(200);
    expect(db.__list("adminAuditEvents")[0].data).toMatchObject({action:"companies.updated",businessId:"a",before:[a,b]});
    expect((await adminGet(req(),context)).headers.get("cache-control")).toBe("no-store");
  });
});

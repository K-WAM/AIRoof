import { describe, expect, it } from "vitest";
import { visibleNavLinks, moneyNavLinks, navIsActive } from "./navModel";
const all = () => true;
const dental = (m: string) => !["jobs", "billing", "pricing"].includes(m);
const paths = (ctx: Parameters<typeof visibleNavLinks>[0]) => visibleNavLinks(ctx).map(l => l.path);
const office = ["/company/dashboard", "/company/pipeline", "/company/calendar", "/company/jobs", "/company/billing", "/company/customers", "/company/library", "/company/settings", "/company/guide"];

describe("grouped company navigation", () => {
  it.each(["owner", "staff", "viewer"])("%s sees one item per group", role => {
    const money = role === "owner" ? "/company/finances" : "/company/billing";
    expect(paths({role, isEnabled:all, showcase:{finances:true,payroll:true}})).toEqual(office.map(p => p === "/company/billing" ? money : p));
    expect(paths({role, isEnabled:all})).toEqual(office);
    const labels = visibleNavLinks({role,isEnabled:all}).map(l=>l.label);
    expect(labels).toEqual(["Dashboard","Requests","Calendar","Jobs","Finances","Customers","Library","Settings","Help"]);
  });
  it("Crew keeps Field and Help, never office or locked products", () => {
    expect(paths({role:"crew",isEnabled:all,isLocked:all})).toEqual(["/company/field","/company/guide"]);
  });
  it("uses the industry's work noun on the Jobs destination", () => {
    expect(visibleNavLinks({role:"owner",isEnabled:all,vocab:{jobNounPlural:"Visits"}}).find(l=>l.path==="/company/jobs")?.label).toBe("Visits");
  });
  it("dental uses patient vocabulary without jobs, field or billing", () => {
    const links=visibleNavLinks({role:"owner",isEnabled:dental,vocab:{customerNounPlural:"Patients"}});
    expect(links.map(l=>l.path)).toEqual(office.filter(p=>!["/company/jobs","/company/billing"].includes(p)));
    expect(links.find(l=>l.path==="/company/customers")?.label).toBe("Patients");
  });
  it("shows one upgrade link for each missing product, with no calls or field duplicate", () => {
    const links=visibleNavLinks({role:"owner",isEnabled:m=>!["calls","billing","jobs"].includes(m),isLocked:all});
    expect(links.filter(l=>l.locked).map(l=>l.path)).toEqual(["/company/pipeline","/company/jobs","/company/billing"]);
  });
  it("shows only bought products when no upgrade is available", () => {
    expect(paths({role:"owner",isEnabled:m=>m!=="calls"})).toEqual(office.filter(p=>p!=="/company/pipeline"));
  });
  it.each(["staff","viewer","crew"])("%s cannot see showcase children", role => {
    expect(moneyNavLinks({role,isEnabled:all,showcase:{finances:true,payroll:true}})).toEqual([{path:"/company/billing",label:"Invoices"}]);
  });
  it("uses each showcase flag independently and keeps invoices tied to billing", () => {
    expect(moneyNavLinks({role:"owner",isEnabled:()=>false,showcase:{payroll:true}})).toEqual([{path:"/company/payroll",label:"Payroll"}]);
    expect(moneyNavLinks({role:"owner",isEnabled:all,showcase:{finances:true}}).map(l=>l.path)).toEqual(["/company/finances","/company/billing"]);
    expect(moneyNavLinks({role:"owner",isEnabled:all,showcase:{finances:true,payroll:true}}).map(l=>l.path)).toEqual(["/company/finances","/company/billing","/company/payroll"]);
    expect(paths({role:"owner",isEnabled:()=>false,showcase:{payroll:true}})).toContain("/company/payroll");
  });
  it("superadmin showcase access still requires Preview", () => {
    expect(moneyNavLinks({superadmin:true,isEnabled:all,showcase:{finances:true,payroll:true}})).toHaveLength(1);
    expect(moneyNavLinks({superadmin:true,preview:true,isEnabled:all,showcase:{finances:true,payroll:true}})).toHaveLength(3);
  });
  it.each([["/company/pipeline","/company/calls"],["/company/billing","/company/payroll"],["/company/finances","/company/billing"],["/company/settings","/company/team"]])("keeps %s active on child %s", (parent,child)=>expect(navIsActive(parent,child)).toBe(true));
});

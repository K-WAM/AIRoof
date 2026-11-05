import { expect, it } from "vitest";
import { companyAssignment } from "../assignment";
const a={id:"rdsf",name:"Roof Pros South",shortName:"RDSF",isDefault:true};const b={id:"rcu",name:"Concepts Unlimited",shortName:"RCU"};
it.each([{}, {billingCompanies:[a]}])("single-company creators store no field even with a supplied id: %j", biz=>expect(companyAssignment(biz,"rcu")).toEqual({}));
it("uses request then customer then default",()=>{const biz={billingCompanies:[a,b]};expect(companyAssignment(biz,"rdsf","rcu")).toEqual({companyId:"rdsf"});expect(companyAssignment(biz,undefined,"rcu")).toEqual({companyId:"rcu"});expect(companyAssignment(biz,"unknown")).toEqual({companyId:"rdsf"});});

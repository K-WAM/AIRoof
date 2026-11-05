import { expect, it } from "vitest";
import { bootstrapCompanies } from "../bootstrap";
const a = {id:"rdsf",name:"Roof Pros South",shortName:"RDSF",isDefault:true};
it.each([{}, {billingCompanies:[a]}])("single-company bootstrap has no new field: %j", b => expect(bootstrapCompanies(b)).toEqual({}));
it("uses the same inline logo data and default fallback as documents", () => {
  const result = bootstrapCompanies({billingCompanies:[a,{id:"rcu",name:"Concepts Unlimited",shortName:"RCU",logoId:"rcu-logo"}],logoUrl:"https://example.test/main.png"}, [{logoId:"rcu-logo",name:"RCU",b64:"cG5n",mimeType:"image/png",variant:"color",createdAt:1}]);
  expect(result.companies?.map(c=>[c.id,c.isDefault,c.logoUrl])).toEqual([["rdsf",true,"data:image/png;base64,cG5n"],["rcu",false,"data:image/png;base64,cG5n"]]);
});

import { expect, it } from "vitest";
import { documentLetterhead } from "../documentLetterhead";
import { resolveLetterhead } from "@/lib/documents/letterhead";
const business={businessName:"Main",address:"Old",contactPhone:"111",contactEmail:"old@example.test",licenseNumber:"OLD",billingPrefs:{payInstructions:"Main bank",payLink:"https://main.test"}};
it("single-company letterhead exactly matches the existing renderer",()=>expect(documentLetterhead(business,null)).toEqual({...business,...resolveLetterhead(business)}));
it("overlays the legal company identity and its bank with escaped rendering left to the existing renderers",()=>{
  const company={id:"rcu",name:"Concepts <Unlimited>",shortName:"RCU",address:"New",phone:"222",email:"rcu@example.test",license:"NEW",payInstructions:"RCU bank",payLink:"https://rcu.test",logoId:"rcu"};
  const result=documentLetterhead(business,company,[{logoId:"rcu",name:"RCU",b64:"a",mimeType:"image/png",variant:"color",createdAt:1}]);
  expect(result).toMatchObject({businessName:company.name,address:"New",contactPhone:"222",contactEmail:"rcu@example.test",licenseNumber:"NEW",billingPrefs:{payInstructions:"RCU bank",payLink:"https://rcu.test"},logoUrl:"data:image/png;base64,a"});
});
it("a non-default company never borrows the business's payment, contact, license or logo details",()=>{
  const business={businessName:"Main",address:"Old",contactPhone:"111",contactEmail:"old@example.test",licenseNumber:"OLD",logoUrl:"data:image/png;base64,old",billingPrefs:{payInstructions:"Main bank",payLink:"https://main.test"}};
  const result=documentLetterhead(business,{id:"rcu",name:"RCU",shortName:"RCU"});
  expect(result).toMatchObject({address:undefined,contactPhone:undefined,contactEmail:undefined,licenseNumber:undefined,logoUrl:null});
  expect(result.billingPrefs).toEqual({payInstructions:"",payLink:""});
});
it("the default company keeps today's fallback to the business's own fields",()=>{
  const business={billingCompanies:[{id:"rdsf",name:"Roof Pros South",shortName:"RDSF",isDefault:true},{id:"rcu",name:"RCU",shortName:"RCU"}],businessName:"Main",address:"Old",contactPhone:"111",contactEmail:"old@example.test",licenseNumber:"OLD",billingPrefs:{payInstructions:"Main bank",payLink:"https://main.test"}};
  expect(documentLetterhead(business,{id:"rdsf",name:"Roof Pros South",shortName:"RDSF",isDefault:true})).toMatchObject({address:"Old",contactPhone:"111",contactEmail:"old@example.test",licenseNumber:"OLD",billingPrefs:{payInstructions:"Main bank",payLink:"https://main.test"}});
});

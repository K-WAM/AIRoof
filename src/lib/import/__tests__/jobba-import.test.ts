import { expect, it } from "vitest";
import { decodeCsvBuffer, parseCsv, parseMoney, parseUsDate, matchKey, mapCustomers, mapProperties, mapMaterials, mapInvoiceHistory, mapInspections, mapServices } from "../../../../scripts/lib/jobba-import.mjs";
it("strips BOM", () => expect(decodeCsvBuffer(Buffer.from([239,187,191,65]))).toBe("A"));
it("parses quoted comma", () => expect(parseCsv('Name,Status\r\n"A, B",Yes')[0].Name).toBe("A, B"));
it("parses quoted newline", () => expect(parseCsv('Name\n"A\nB"')[0].Name).toBe("A\nB"));
it("parses escaped quote", () => expect(parseCsv('Name\n"A ""B"""')[0].Name).toBe('A "B"'));
it("falls back to windows-1252", () => expect(decodeCsvBuffer(Buffer.from([0x92]))).toBe("’"));
it.each([["$1,250.00",1250],["($25.00)",-25],["",0]])("parses money %s", (s,n) => expect(parseMoney(s)).toBe(n));
it.each([["11/3/26",Date.UTC(2026,10,3,17)],["11/3/2026",Date.UTC(2026,10,3,17)],["",undefined]])("parses date %s", (s,n) => expect(parseUsDate(s,"America/New_York")).toBe(n));
it.each([["Seagrass Property Group","seagrass property group|"],["  Élan  Inc ","elan inc|"],["The Roof Co","the roof co|"]])("matches %s", (name,key) => expect(matchKey({name})).toBe(key));
it("merges customers", () => expect(mapCustomers([{Name:"Seagrass",Status:"Active"},{Name:"SEAGRASS",Status:"Active"}])).toHaveLength(1));
it("caps properties", () => { const x=mapProperties(Array.from({length:501},()=>({Owner:"Seagrass"}))); expect(x.properties.get("seagrass|")).toHaveLength(500); expect(x.cut).toBe(1); });
it("skips disabled materials", () => expect(mapMaterials([{Name:"Nail",Enabled:"No"},{Name:"Board",Enabled:"Yes","Std Cost":"3"}])).toEqual([{name:"Board",unit:"each",unitPrice:3}]));
it("maps voided invoices", () => expect(mapInvoiceHistory([{ "Invoice ID":"1",Date:"11/3/26",Voided:"Yes","Amt Due":"12.50"}],"America/New_York")[0]).toMatchObject({id:"jobba-1",voided:true,amountDue:12.5}));
it("maps inspections", () => expect(mapInspections([{ID:"1",Customer:"Seagrass",Due:"11/3/26"}],"America/New_York")[0]).toMatchObject({id:"jobba-1",customerName:"Seagrass",dueAt:Date.UTC(2026,10,3,17)}));
it("gives rows with a blank Jobba ID their own stable id instead of one shared \"jobba-\"", () => {
  const rows = [{ID:"",Customer:"Seagrass",Due:"11/3/26"},{ID:" ",Customer:"Palm Isles",Due:"11/4/26"}];
  const [a, b] = mapInspections(rows, "America/New_York"), again = mapInspections(rows, "America/New_York");
  expect(a.id).toMatch(/^jobba-noid-[0-9a-f]{12}$/);
  expect(b.id).not.toBe(a.id);
  expect(again.map(r => r.id)).toEqual([a.id, b.id]);
  expect(mapInvoiceHistory([{"Invoice ID":"","Bill To":"Seagrass"}], "America/New_York")[0].id).toMatch(/^jobba-noid-/);
});

it("maps multi-line work orders in a namespace distinct from inspections", () => {
  const rows = parseCsv('WO ID,Deal ID,Customer,Description,Due,Type,Status,Job Type\n42,70,Sample School,"Repair flashing\nCheck seal",11/4/26,Service,Done,Repair');
  expect(mapServices(rows, "America/New_York")[0]).toMatchObject({id:"jobba-wo-42",kind:"work-order",description:"Repair flashing\nCheck seal",dealId:"70",type:"Service",customerName:"Sample School",dueAt:Date.UTC(2026,10,4,17)});
  expect(mapInspections([{ID:"42"}], "America/New_York")[0]).toMatchObject({id:"jobba-42",kind:"inspection"});
});
it("preserves missing WO IDs with stable distinct IDs and leaves unmatched customers unmatched", () => {
  const rows = [{"WO ID":"",Customer:"Invented Unmatched",Description:"First"},{"WO ID":" ",Customer:"Invented Unmatched",Description:"Second"}];
  const mapped = mapServices(rows, "America/New_York");
  expect(mapped[0].id).toMatch(/^jobba-wo-noid-/);
  expect(mapped[1].id).not.toBe(mapped[0].id);
  expect(mapServices(rows, "America/New_York")).toEqual(mapped);
  const customers = new Map([[matchKey({name:"Sample School"}), "C-1"]]);
  expect(customers.get(matchKey({name:mapped[0].customerName}))).toBeUndefined();
  expect(mapped[0]).not.toHaveProperty("customerId");
});

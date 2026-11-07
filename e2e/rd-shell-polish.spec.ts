import { test, expect, settle, shot, expectHealthy } from "./fixtures";
import type { Page } from "@playwright/test";

async function capture(page:Page,name:string) { await page.evaluate(()=>window.scrollTo(0,0));await shot(page,name); }
async function menu(page:Page,isMobile:boolean) { if(isMobile) await page.getByRole("button",{name:"Open menu"}).click(); }
async function visit(page:Page,path:string) { await page.goto(path);await settle(page);await expect(page.getByText("Failed to load this page",{exact:true})).toHaveCount(0); }

test("L2 shell, Help, logos, search and customer company field",async({as,isMobile})=>{
 test.setTimeout(240_000);
 const page=await as("proOwner");if(!isMobile)await page.setViewportSize({width:1440,height:900});
 await visit(page,"/company/guide");
 await expect(page.getByRole("tablist",{name:"Guide for"})).toBeVisible();
 const selected=page.getByRole("tab",{selected:true});await expect(selected).toHaveCSS("color","rgb(255, 255, 255)");
 await expect(page.getByRole("navigation",{name:"Help sections"})).toHaveCount(0);
 await expect(page.locator(".guide-logo")).toBeVisible();
 if(isMobile) await expect(page.getByRole("button",{name:"New",exact:true})).toBeInViewport();
 else {await expect(page.locator(".company-topbar .quickadd-trigger")).toBeInViewport();await expect(page.locator(".company-sidebar-footer .quickadd-trigger")).toHaveCount(0);}
 await capture(page,"l2-guide");
 for(const width of isMobile?[375]:[1440,1024]) {
  await page.setViewportSize({width,height:isMobile?812:900});
  const after=await page.locator(".company-brand-other img").evaluate(img=>{const el=img as HTMLImageElement;const r=el.getBoundingClientRect();return {rendered:r.width/r.height,natural:el.naturalWidth/el.naturalHeight,width:r.width,height:r.height}});
  console.log(`L2 RCU ${width}:`,JSON.stringify({after}));expect(Math.abs(after.rendered-after.natural)).toBeLessThan(.002);
  await capture(page,`l2-header-${width}`);
 }
 if(!isMobile)await page.setViewportSize({width:1440,height:900});
 await menu(page,isMobile);await page.getByRole("button",{name:"Send feedback",exact:true}).filter({visible:true}).click();
 await expect(page.getByText("From: Paula Pro · E2E Roof Pros")).toBeVisible();await expect(page.getByLabel("Message")).toBeFocused();
 await capture(page,"l2-feedback");await page.getByRole("button",{name:"Cancel",exact:true}).click();
 if(isMobile)await page.getByRole("button",{name:"Search",exact:true}).click();else await page.getByRole("searchbox",{name:"Search",exact:true}).click();
 await page.getByRole("combobox").fill("Sample");await expect(page.locator(".cmd-type").first()).toBeVisible();
 // The shared class must fit every noun, including vocabulary variants the current search doesn't return.
 for(const label of ["CUSTOMER","JOB","REQUEST","INVOICE","PATIENT","BOOKING"]) {
  await page.locator(".cmd-type").first().evaluate((el,text)=>{el.textContent=text},label);
  const size=await page.locator(".cmd-type").first().evaluate(el=>({height:el.getBoundingClientRect().height,line:parseFloat(getComputedStyle(el).lineHeight),width:el.clientWidth,scroll:el.scrollWidth,wrap:getComputedStyle(el).whiteSpace}));
  expect(size.wrap).toBe("nowrap");expect(size.scroll).toBeLessThanOrEqual(size.width+1);
 }
 await capture(page,"l2-search");await page.keyboard.press("Escape");
 await visit(page,"/company/customers");await page.getByRole("button",{name:/^New customer$/i}).click();
 const company=page.getByRole("radiogroup",{name:"Company",exact:true});await expect(company).toBeVisible();
 for(const option of await company.getByRole("radio").all()){expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);}
 const gap=await page.locator("#customer-kind-label").evaluate(el=>el.getBoundingClientRect().top-document.querySelector('.company-toggle')!.getBoundingClientRect().bottom);expect(gap).toBeGreaterThanOrEqual(20);
 await company.getByRole("radio",{name:"RCU",exact:true}).click();await expect(company.getByRole("radio",{name:"RCU",exact:true})).toBeChecked();
 await capture(page,"l2-customer-company");await expectHealthy(page);
 await visit(page,"/company/jobs/J-3161");
 const jobTab=page.locator('.segment[aria-selected="true"]').first();await expect(jobTab).toHaveCSS("color","rgb(255, 255, 255)",{timeout:60_000});await capture(page,"l2-job-tabs");
});

test("L2 Finances chart filters locally and payments preview reads imported history",async({as,isMobile})=>{
 test.setTimeout(180_000);const page=await as("proOwner");if(!isMobile)await page.setViewportSize({width:1440,height:900});
 let requests=0;page.on("request",r=>{if(new URL(r.url()).pathname==="/api/company/finance")requests++;});
 await visit(page,"/company/finances");await expect(page.getByRole("heading",{name:"Invoiced and collected by month"})).toBeVisible();
 requests=0;const start=Date.now();await page.reload();await page.getByRole("heading",{name:"Invoiced and collected by month"}).waitFor();
 console.log(`L2 Finances ${isMobile?375:1440}: warm load ${Date.now()-start}ms, ${requests} request(s)`);expect(requests).toBe(1);
 await expect(page.locator(".k2-finance-kpis button")).toHaveCount(4);
 for(const total of await page.locator(".k2-finance-kpis button").all())await expect(total).toBeInViewport();
 await capture(page,"l2-finances-first-screen");
 const months=page.locator('svg [role="button"]');await expect(months).toHaveCount(12);
 const beforeCount=await page.getByText(/^\d+ invoices \/ Page/).innerText();
 const current=months.last();await current.focus();await expect(page.getByRole("status")).toContainText("Invoiced");
 await current.press("Enter");await expect(current).toHaveAttribute("aria-pressed","true");await expect(page.getByText(/^\d+ invoices \/ Page/)).not.toHaveText(beforeCount);await expect(page.getByRole("cell",{name:"L2-03",exact:true})).toHaveCount(0);await capture(page,"l2-finances-active-month");
 await page.getByRole("button",{name:"Filters",exact:true}).click();
 await expect(page.getByLabel("From",{exact:true})).toHaveValue(`${new Date().toISOString().slice(0,7)}-01`);
 await current.click();await page.getByLabel(/^Status/).selectOption("paid");await page.getByLabel("Customer",{exact:true}).fill("Lakeview County Schools");
 expect(requests).toBe(1);console.log(`L2 Finances local status/customer/month: total ${requests} request(s)`);
 await capture(page,"l2-finances-chart");await expectHealthy(page);
 await current.click();
 const selectedEnd=await page.getByLabel("To",{exact:true}).inputValue();
 await page.getByLabel("From",{exact:true}).fill(`${new Date().toISOString().slice(0,7)}-02`);
 await expect(page.getByLabel("To",{exact:true})).toHaveValue(selectedEnd);
 await expect.poll(()=>requests).toBe(2);
 await expect(page.getByRole("heading",{name:"Invoiced and collected by month"})).toBeVisible();
 await visit(page,"/company/billing");const baseline=requests;await page.getByText("See how customers would pay online",{exact:true}).click();
 await expect(page.getByText("Invoice L2-00",{exact:true})).toBeVisible();await expect(page.getByText("Roof Pros South",{exact:true})).toBeVisible();
 expect(requests-baseline).toBe(1);await expect(page.getByRole("button",{name:/Pay by bank/})).toBeDisabled();await expect(page.getByText("Acme Property Group",{exact:true})).toHaveCount(0);
 await capture(page,"l2-payments");
});

test("L2 Crew feedback and View as role and no-send preview",async({as,isMobile})=>{
 test.setTimeout(180_000);const crew=await as("fieldCrew");await visit(crew,"/company/field");await menu(crew,isMobile);
 await expect(crew.getByRole("button",{name:"Send feedback",exact:true}).filter({visible:true})).toBeVisible();await expect(crew.locator(".quickadd-trigger")).toHaveCount(0);await expect(crew.getByRole("button",{name:"New",exact:true})).toHaveCount(0);
 const page=await as("superadmin");await visit(page,"/admin/businesses");
 const row=page.getByRole("row").filter({hasText:"e2e-roofpros"}).first();await row.getByRole("button",{name:"View as",exact:true}).click();await page.getByRole("dialog",{name:/View as/}).getByRole("button",{name:"Owner",exact:true}).click();
 await page.waitForURL(/company/);await settle(page);await menu(page,isMobile);
 await expect(page.locator(".user-role-badge").filter({visible:true}).first()).toHaveText("OWNER");await expect(page.locator(".user-email").filter({visible:true}).first()).toHaveText("E2E Roof Pros");
 let sends=0;page.on("request",r=>{if(new URL(r.url()).pathname==="/api/feedback")sends++;});
 await page.getByRole("button",{name:"Send feedback",exact:true}).filter({visible:true}).click();await expect(page.getByText("From: Owner · E2E Roof Pros")).toBeVisible();
 await page.getByLabel("Message").fill("A preview only");await page.getByRole("button",{name:"Send",exact:true}).click();await expect(page.getByText(/Sent. Luxor will reply within 24 hours.*preview — not sent/)).toBeVisible();expect(sends).toBe(0);await capture(page,"l2-view-as-feedback");
});

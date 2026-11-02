import AxeBuilder from "@axe-core/playwright";
import { api, must } from "../scripts/e2e/lib.cjs";
import { expect, expectHealthy, shot, test } from "./fixtures";

let cleanupCalendar: (() => Promise<void>) | undefined;
test.afterEach(async () => { try { await cleanupCalendar?.(); } finally { cleanupCalendar = undefined; } });
const dayNumber = (day: Date) => Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86400000;
function businessToday() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
  const n = (key: string) => Number(parts.find((part) => part.type === key)!.value);
  return new Date(n("year"), n("month") - 1, n("day"));
}

for (const screen of ["Dashboard", "Calendar", "Jobs", "Job detail", "Pipeline", "Field", "Login", "Legal"]) {
  test(`${screen} has no serious or critical accessibility violations`, async ({ as, page: publicPage, isMobile }) => {
    const isPublic = screen === "Login" || screen === "Legal";
    const page = isPublic ? publicPage : await as(screen === "Field" ? "fieldCrew" : "owner");
    let path = screen === "Login" ? "/login" : screen === "Legal" ? "/legal/terms" : `/company/${screen.toLowerCase()}`;
    let calendarDay: Date | undefined, calendarTitle: string | undefined;
    if (screen === "Calendar") {
      const owner = await api("owner"), businessId = "e2e-roofing", tag = Date.now();
      const crew = must(await owner.post("/api/company/crews", { businessId, name: `Accessibility ${tag}` })).crew;
      const fixture: { jobId?: string } = {};
      cleanupCalendar = async () => {
        if (fixture.jobId) must(await owner.post(`/api/jobs/${fixture.jobId}/assign`, { businessId, crewId: null, notify: false }));
        must(await owner.del(`/api/company/crews?businessId=${businessId}&crewId=${crew.crewId}`));
      };
      calendarDay = businessToday(); calendarDay.setDate(calendarDay.getDate() + 1);
      while ([0, 6].includes(calendarDay.getDay())) calendarDay.setDate(calendarDay.getDate() + 1);
      const key = `${calendarDay.getFullYear()}-${String(calendarDay.getMonth() + 1).padStart(2, "0")}-${String(calendarDay.getDate()).padStart(2, "0")}`;
      const slots = must(await owner.get(`/api/company/crews/open-times?businessId=${businessId}&crewId=${crew.crewId}&day=${key}&durationMin=60`)).starts as number[];
      expect(slots.length).toBeGreaterThan(0);
      calendarTitle = `Accessibility schedule ${tag}`;
      const job = must(await owner.post("/api/jobs", { businessId, title: calendarTitle, address: "12 Test Street" })).job;
      const jobId = job.jobId as string;
      fixture.jobId = jobId;
      must(await owner.post("/api/jobs", { businessId, title: `Accessibility waiting ${tag}`, address: "14 Test Street" }));
      must(await owner.post(`/api/jobs/${jobId}/assign`, { businessId, crewId: crew.crewId, scheduledStart: slots[0], scheduledEnd: slots[0] + 3600000, crewConfirmed: false, notify: false }));
    }
    if (screen === "Job detail" || screen === "Field") {
      const owner = await api("owner");
      const { job } = must(await owner.post("/api/jobs", { businessId: "e2e-roofing", title: `Accessibility ${Date.now()}`, clientName: "Alex Test", address: "12 Test Street" }), "create accessibility job");
      path = screen === "Field" ? `/company/field?jobId=${job.jobId}` : `/company/jobs/${job.jobId}`;
    }
    await page.goto(path);
    await expect(page.getByRole("heading").first()).toBeVisible();
    if (calendarDay) {
      const today = businessToday();
      if (isMobile) for (let i = 0; i < dayNumber(calendarDay) - dayNumber(today); i++) await page.getByRole("button", { name: "Next day", exact: true }).click();
      else {
        const monday = new Date(); // the desktop board's week follows the browser's calendar date
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
        for (let i = 0; i < Math.floor((dayNumber(calendarDay) - dayNumber(monday)) / 7); i++) await page.getByRole("button", { name: "Next week", exact: true }).click();
      }
      await expect(page.getByText(calendarTitle!, { exact: !isMobile }).filter({ visible: true }).first()).toBeVisible();
    }
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    if (screen === "Field") {
      const selected = page.getByTestId("job-selected");
      const choice = page.getByTestId("job-option").first();
      await expect(selected.or(choice)).toBeVisible();
      if (!(await selected.isVisible())) await choice.click();
      await expect(selected).toBeVisible();
    }
    await expect(page.getByText(/Failed to load this page|This page couldn.t load/)).toHaveCount(0);
    await expectHealthy(page);
    const results = await new AxeBuilder({ page }).analyze();
    const violations = results.violations.filter(({ impact }) => impact === "critical" || impact === "serious");
    await test.info().attach("axe", { body: JSON.stringify(violations, null, 2), contentType: "application/json" });
    await shot(page, `a11y-${screen}`);
    expect(violations, `${screen}: ${violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`).join("\n")}`).toEqual([]);
  });
}

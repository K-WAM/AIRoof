import { describe, expect, it } from "vitest";
import { trackedPage } from "./pageView";

describe("trackedPage", () => {
  it("keeps useful page categories without dynamic IDs or query strings", () => {
    expect(trackedPage("/try/pet-care?source=ad")).toBe("/try/pet-care");
    expect(trackedPage("/company/jobs/job-with-customer-name?preview=demo-roofing")).toBe("/company/jobs");
    expect(trackedPage("/admin/businesses/private-business-id")).toBe("/admin/businesses");
  });

  it("drops private or unknown routes", () => {
    expect(trackedPage("/f/private-grant-token")).toBeNull();
    expect(trackedPage("/pay/success?session_id=secret")).toBeNull();
    expect(trackedPage("/try/unlisted-person-name")).toBeNull();
  });
});

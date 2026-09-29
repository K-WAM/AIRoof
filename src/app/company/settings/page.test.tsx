// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useBusinessId", () => ({ useBusinessId: () => "biz" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { role: "owner" } }) }));
vi.mock("@/contexts/BootstrapContext", () => ({ useBootstrap: () => ({ data: { business: { smsEnabled: false } } }) }));
vi.mock("@/components/scheduling/HoursEditor", () => ({ HoursEditor: () => <div>Hours editor</div>, DEFAULT_BUSINESS_HOURS: {} }));
vi.mock("./NoticesPanel", () => ({ NoticesPanel: () => <div>Legal notices</div> }));
vi.mock("./TeamPanel", () => ({ TeamPanel: () => <div>Team preferences</div> }));

import CompanySettingsPage from "./page";

const settings = {
  businessName: "Roof Co", timezone: "America/New_York", businessHours: {}, notificationEmail: "alerts@example.com",
  contactPhone: "+13055550100", contactEmail: "hello@example.com", licenseNumber: "", agentLanguage: "en",
};
let linesResponse: Response;
beforeEach(() => {
  linesResponse = new Response(null, { status: 404 });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.startsWith("/api/company/phone-lines")
    ? linesResponse : new Response(JSON.stringify(settings), { status: 200 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Settings sections and phone status", () => {
  it("orders the six sections, keeps legal notices, and quietly labels a missing line API", async () => {
    render(<CompanySettingsPage />);
    expect(await screen.findByText("Line status unavailable")).toBeTruthy();
    expect([...document.querySelectorAll(".settings-section-content > section")].map((section) => section.id))
      .toEqual(["company", "hours", "phone", "documents", "terms", "advanced"]);
    expect(screen.getByText("Legal notices")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Contact Luxor to change your phone line" }).getAttribute("href")).toBe("mailto:connect@luxordev.com");
  });

  it("does not call texting on when a line is pending, and warns about unsaved settings", async () => {
    linesResponse = new Response(JSON.stringify({ lines: [{ lineId: "l", businessId: "biz", e164: "+13055550100", display: "+1 (305) 555-0100", country: "US", label: "Main", purpose: "client", status: "connected", sms: { status: "pending_registration", purposes: [], isDefaultSender: false }, nextStep: "Luxor completes registration" }] }), { status: 200 });
    render(<CompanySettingsPage />);
    expect(await screen.findByText("Texting registration pending")).toBeTruthy();
    expect(screen.queryByText("Texting ready")).toBeNull();
    fireEvent.change(screen.getByLabelText("Notification email"), { target: { value: "new@example.com" } });
    await waitFor(() => expect(screen.getByText(/Unsaved changes/)).toBeTruthy());
  });
});

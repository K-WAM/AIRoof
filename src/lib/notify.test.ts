import { describe, expect, it } from "vitest";
import { buildInspectionEmail } from "./notify";

const brand = { businessName: "Apex Roofing", contactPhone: "(305) 555-0111", contactEmail: "hello@apex.test" };

describe("buildInspectionEmail", () => {
  it.each([
    ["assigned", "New inspection"],
    ["moved", "Inspection moved"],
    ["reassigned", "Inspection reassigned"],
    ["cancelled", "Inspection cancelled"],
  ] as const)("uses the %s subject and lists the facts", (change, label) => {
    const { subject, html } = buildInspectionEmail({
      brand, change, when: "Monday at 8 AM", address: "12 Palm Ave", customerName: "Carla", customerPhone: "3055550111",
    });
    expect(subject).toBe(`[Inspection] ${label} \u2014 Monday at 8 AM`);
    expect(html).toContain(label);
    expect(html).toContain("12 Palm Ave");
    expect(html).toContain("Carla");
    expect(html).toContain("3055550111");
    expect(html).toContain("Apex Roofing");
  });

  it("escapes free text and includes access/urgent lines and the call summary", () => {
    const { html } = buildInspectionEmail({
      brand,
      change: "assigned",
      when: "Monday at 8 AM",
      address: "1 <script> & Co",
      customerName: "Carla <b>",
      accessLines: ["Access: gate 1010"],
      urgentLines: ["URGENT: active leak"],
      callSummary: "Caller says <leak> is active",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("1 &lt;script&gt; &amp; Co");
    expect(html).toContain("Access: gate 1010");
    expect(html).toContain("URGENT: active leak");
    expect(html).toContain("Caller says &lt;leak&gt; is active");
  });

  it("omits absent optional facts", () => {
    const { html } = buildInspectionEmail({ brand, change: "cancelled", when: "Monday at 8 AM" });
    expect(html).not.toContain("Address");
    expect(html).not.toContain("Customer");
    expect(html).not.toContain("Call summary");
  });
});

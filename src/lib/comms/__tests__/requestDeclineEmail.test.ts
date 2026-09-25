import { describe, expect, it } from "vitest";
import { buildRequestDeclineEmail } from "@/lib/comms/requestDeclineEmail";

describe("buildRequestDeclineEmail", () => {
  const brand = { businessName: "A & B <Service>", brandColor: "#0f766e", contactEmail: "team@example.test" };
  it("escapes all customer-controlled content", () => {
    const email = buildRequestDeclineEmail({ brand, clientName: "<Ada>", serviceType: "<script>", reason: "Other", customMessage: "<b>Sorry</b> & thanks" });
    expect(email.html).toContain("&lt;Ada&gt;");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;b&gt;Sorry&lt;/b&gt; &amp; thanks");
  });
  it("uses neutral availability wording without blaming the customer", () => {
    const email = buildRequestDeclineEmail({ brand, reason: "Fully booked" });
    expect(email.html).toContain("availability cannot accommodate");
    expect(email.html.toLowerCase()).not.toContain("your fault");
  });
});

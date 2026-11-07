import { expect, it } from "vitest";
import { createRequire } from "node:module";
import type { ReactNode } from "react";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { DataReview } from "@/components/onboarding/DataReview";
import { ONBOARDING_FORMS } from "../forms";
// React DOM is installed; this checkout does not include its server entry's declaration package.
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as { renderToStaticMarkup: (node: ReactNode) => string };
it("renders all five form definitions, safe-use wording and an inert preview", () => {
  for (const definition of Object.values(ONBOARDING_FORMS)) {
    const html = renderToStaticMarkup(<OnboardingForm payload={{ definition, prefill: {} }} readOnly />);
    expect(html).toContain(definition.title.replace(/&/g, "&amp;"));
    expect(html).toContain("How we use this information");
    expect(html).toContain("Your name");
    expect(html).toContain("disabled");
    expect(html).not.toContain('type="submit"');
    expect(html).toContain('rel="noopener noreferrer"');
  }
});
it("renders adversarial data-review content as text and consecutive bullets as one list", () => {
  const html = renderToStaticMarkup(<DataReview review={{ title: "Review", intro: "<script>alert(1)</script>", sections: [{ heading: "A", body: "A paragraph\ncontinues here.\n\n- First\n- Second\n\n<img src=x onerror=alert(1)>" }], updatedAt: 1 }} />);
  expect(html).not.toContain("<script>"); expect(html).not.toContain("<img"); expect(html).toContain("&lt;script&gt;");
  expect(html.match(/<ul>/g)).toHaveLength(1); expect(html.match(/<li>/g)).toHaveLength(2);
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CompanyBadgeRow } from "../CompanyBadge";

afterEach(cleanup);

const companies = [
  { id: "rdsf", name: "Roof Doctors South Florida", shortName: "RDSF", isDefault: true, logoUrl: null },
  { id: "rcu", name: "Roofing Concepts Unlimited", shortName: "RCU", isDefault: false, logoUrl: null },
];

describe("CompanyBadgeRow", () => {
  it("renders only the child (today's markup) when no badge would show", () => {
    const { container } = render(
      <CompanyBadgeRow companies={companies} companyId="rdsf"><span className="child">Text</span></CompanyBadgeRow>,
    );
    expect(container.innerHTML).toBe('<span class="child">Text</span>');
  });

  it("wraps the child in the badge row only when the badge renders", () => {
    const { container } = render(
      <CompanyBadgeRow companies={companies} companyId="rcu"><span className="child">Text</span></CompanyBadgeRow>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.display).toBe("inline-flex");
    expect(wrapper.querySelector(".tag")?.textContent).toBe("RCU");
    expect(wrapper.querySelector(".child")?.textContent).toBe("Text");
  });

  it("never wraps for a single-company business", () => {
    const { container } = render(
      <CompanyBadgeRow companies={[companies[1]]} companyId="rcu"><span className="child">Text</span></CompanyBadgeRow>,
    );
    expect(container.innerHTML).toBe('<span class="child">Text</span>');
  });
});

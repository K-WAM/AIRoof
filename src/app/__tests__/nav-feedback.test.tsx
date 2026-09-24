// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  value: {
    user: null as null | {
      uid: string;
      email: string | null;
      businessId?: string;
      role?: string;
      superadmin?: boolean;
    },
    loading: false,
    idToken: null as string | null,
  },
}));

const routeState = vi.hoisted(() => ({
  pathname: "/admin/businesses",
  search: "" as string,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState.value,
}));

vi.mock("@/hooks/useBusinessModules", () => ({
  useBusinessModules: () => ({ isEnabled: () => true, ready: true }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => routeState.pathname,
  useSearchParams: () => new URLSearchParams(routeState.search),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { AdminNav } from "@/app/admin/admin-nav";
import { HubNav } from "@/app/hub/hub-nav";
import { CompanyNav } from "@/app/company/company-nav";

const clientUser = {
  uid: "u1",
  email: "client@acme.com",
  businessId: "acme",
  role: "owner",
  superadmin: false,
};

const navs = [
  { name: "admin", render: () => <AdminNav /> },
  { name: "hub", render: () => <HubNav /> },
  { name: "company", render: () => <CompanyNav /> },
];

describe("Feedback access in the three navs (T-114)", () => {
  afterEach(() => cleanup());

  it("shows the Feedback control for a client user", () => {
    authState.value = { user: clientUser, loading: false, idToken: null };
    for (const nav of navs) {
      const view = render(nav.render());
      expect(screen.getByRole("button", { name: "Send feedback" }), nav.name).toBeInTheDocument();
      view.unmount();
    }
  });

  it("never shows the Feedback control — or mounts the form — for a superadmin", () => {
    authState.value = {
      user: { ...clientUser, superadmin: true, role: "superadmin" },
      loading: false,
      idToken: null,
    };
    for (const nav of navs) {
      const view = render(nav.render());
      expect(screen.queryByRole("button", { name: "Send feedback" }), nav.name).not.toBeInTheDocument();
      expect(screen.queryByText("Send feedback to Luxor"), nav.name).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("hides Feedback for a superadmin previewing a client through ?preview=", () => {
    authState.value = {
      user: { ...clientUser, superadmin: true, role: "superadmin" },
      loading: false,
      idToken: null,
    };
    routeState.search = "preview=demo-roofing";
    const view = render(<CompanyNav />);
    expect(screen.queryByRole("button", { name: "Send feedback" })).not.toBeInTheDocument();
    view.unmount();
    routeState.search = "";
  });

  it("never flashes the control before the auth profile resolves", () => {
    authState.value = { user: null, loading: true, idToken: null };
    for (const nav of navs) {
      const view = render(nav.render());
      expect(screen.queryByRole("button", { name: "Send feedback" }), nav.name).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe("Company nav destinations (T-114)", () => {
  afterEach(() => cleanup());

  it("keeps every destination reachable and groups Guide + Feedback under Help", () => {
    authState.value = { user: clientUser, loading: false, idToken: null };
    routeState.pathname = "/company/dashboard";
    render(<CompanyNav />);

    const hrefs = screen.getAllByRole("link").map((el) => el.getAttribute("href"));
    for (const href of [
      "/company/dashboard",
      "/company/pipeline",
      "/company/calls",
      "/company/calendar",
      "/company/jobs",
      "/company/field",
      "/company/library",
      "/company/settings",
      "/company/guide",
    ]) {
      expect(hrefs, href).toContain(href);
    }

    expect(screen.getByText("Help")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Guide/ })).toHaveAttribute("href", "/company/guide");
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeInTheDocument();
  });

  it("keeps the preview suffix on the Help links", () => {
    authState.value = { user: clientUser, loading: false, idToken: null };
    routeState.search = "preview=demo-roofing";
    render(<CompanyNav />);

    expect(screen.getByRole("link", { name: /Guide/ })).toHaveAttribute(
      "href",
      "/company/guide?preview=demo-roofing"
    );
    routeState.search = "";
  });
});

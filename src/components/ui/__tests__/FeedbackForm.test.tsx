// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState.value,
}));

const searchState = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchState.value),
}));

import { FeedbackForm } from "@/components/ui/FeedbackForm";

const clientUser = {
  uid: "u1",
  email: "client@acme.com",
  businessId: "acme",
  role: "owner",
  superadmin: false,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("FeedbackForm (T-114)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders client-facing wording and never implies it comes from the client's company", () => {
    authState.value = { user: clientUser, loading: false, idToken: null };
    render(<FeedbackForm open onClose={() => {}} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Send feedback to Luxor")).toBeInTheDocument();
    expect(screen.getByText(/goes to the Luxor team — not to your own company/)).toBeInTheDocument();
    expect(screen.getByText("We'll reply to")).toBeInTheDocument();
    expect(screen.getByText("client@acme.com")).toBeInTheDocument();
    // The old misleading "From <email>" row is gone.
    expect(screen.queryByText("From")).not.toBeInTheDocument();

    expect(screen.getByLabelText(/Category/)).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toBeInTheDocument();
    expect(screen.getByText("0/2000")).toBeInTheDocument();
  });

  it("keeps Send disabled until a message is typed", () => {
    authState.value = { user: clientUser, loading: false, idToken: null };
    render(<FeedbackForm open onClose={() => {}} />);

    const send = screen.getByRole("button", { name: /^send$/i });
    expect(send).toBeDisabled();
    expect(send).toHaveClass("button", "primary", "small");

    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "A suggestion" } });
    expect(send).not.toBeDisabled();
  });

  it("shows the 'Thanks — we read every message' success state", async () => {
    authState.value = { user: clientUser, loading: false, idToken: null };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: true })));
    render(<FeedbackForm open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Dark mode please" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(screen.getByText(/we read every message/)).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("shows a sensible, announced error state when sending fails", async () => {
    authState.value = { user: clientUser, loading: false, idToken: null };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Failed to send feedback — please try again later" }, 502))
    );
    render(<FeedbackForm open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Something broke" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Failed to send feedback/);
  });

  it("sends the company being previewed and the page, for a superadmin previewing a client (2026-09-28)", async () => {
    authState.value = {
      user: { uid: "sa", email: "connect@luxordev.com", superadmin: true, role: "superadmin" },
      loading: false,
      idToken: null,
    };
    searchState.value = "preview=demo-roofing";
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<FeedbackForm open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Testing the form" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ businessId: "demo-roofing", message: "Testing the form", page: "/" });
    searchState.value = "";
  });

  it("renders nothing before the auth profile resolves", () => {
    authState.value = { user: null, loading: true, idToken: null };
    render(<FeedbackForm open onClose={() => {}} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

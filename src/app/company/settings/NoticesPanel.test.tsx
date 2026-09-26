// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLORIDA_NOTICE_DEFAULTS } from "@/lib/documents/legalNotices";
import { effectiveNotices } from "@/lib/documents/notices";
import { NoticesPanel } from "./NoticesPanel";

let role = "owner";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { role, superadmin: false } }) }));

type Call = { method: string; body?: Record<string, unknown> };
let calls: Call[];
let status: "never" | "draft-markers" | "approved";

const view = () => ({
  notices: effectiveNotices(),
  approval: { approved: status === "approved", status, approvedAt: null, blockingIds: status === "draft-markers" ? FLORIDA_NOTICE_DEFAULTS.filter((d) => /\[\s*DRAFT/i.test(d.text)).map((d) => d.id) : [] },
});

beforeEach(() => {
  role = "owner"; status = "draft-markers"; calls = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(view()), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("NoticesPanel", () => {
  it("renders nothing for a non-owner", () => {
    role = "staff";
    const { container } = render(<NoticesPanel businessId="biz" />);
    expect(container.textContent).toBe("");
    expect(calls).toHaveLength(0);
  });

  it("shows the DRAFT banner and keeps approval disabled while placeholder wording remains", async () => {
    render(<NoticesPanel businessId="biz" />);
    await screen.findByText(/Some wording is still a draft placeholder/);
    expect(screen.getByText(/Attorney review required/)).toBeTruthy();
    expect((screen.getByText("I have had these reviewed") as HTMLButtonElement).disabled).toBe(true);
  });

  it("editing marks the wording unsaved; saving PUTs every notice, and approval needs a save first", async () => {
    status = "never";
    render(<NoticesPanel businessId="biz" />);
    const approve = (await screen.findByText("I have had these reviewed")) as HTMLButtonElement;
    expect(approve.disabled).toBe(false);
    const first = FLORIDA_NOTICE_DEFAULTS[0];
    fireEvent.change(screen.getByLabelText(`${first.title} wording`), { target: { value: "Attorney wording." } });
    expect(approve.disabled).toBe(true);
    fireEvent.click(screen.getByText("Save wording"));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!;
    expect((put.body!.notices as Record<string, { text: string }>)[first.id].text).toBe("Attorney wording.");
    expect(Object.keys(put.body!.notices as object)).toHaveLength(FLORIDA_NOTICE_DEFAULTS.length);
  });

  it("approving asks for confirmation, then sends approve: true", async () => {
    status = "never";
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<NoticesPanel businessId="biz" />);
    fireEvent.click(await screen.findByText("I have had these reviewed"));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({ businessId: "biz", approve: true }));
  });
});

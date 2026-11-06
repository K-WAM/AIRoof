// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArchiveClientPanel } from "../ArchiveClientPanel";

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ArchiveClientPanel", () => {
  it("confirms with the client name, archives, and reports the new purpose", async () => {
    const onChanged = vi.fn();
    const fetchMock = vi.fn(async () => respond({ success: true, accountPurpose: "archived", previousAccountPurpose: "client" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ArchiveClientPanel businessId="b" businessName="Fake Co" accountPurpose="client" demo={false} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "Archive client" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Archive Fake Co? It moves to the Archived tab. Nothing is deleted and you can restore it.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Archive client" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({ accountPurpose: "archived", previousAccountPurpose: "client" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/businesses/b/archive",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ archived: true }) }),
    );
    expect(await screen.findByText(/Client archived/)).toBeTruthy();
  });

  it("shows Archived with a Restore button and restores the previous purpose", async () => {
    const onChanged = vi.fn();
    const fetchMock = vi.fn(async () => respond({ success: true, accountPurpose: "test", previousAccountPurpose: null }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ArchiveClientPanel businessId="b" businessName="Fake Co" accountPurpose="archived" demo={false} onChanged={onChanged} />);
    expect(screen.getByText("Archived")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({ accountPurpose: "test", previousAccountPurpose: null }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/businesses/b/archive",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ archived: false }) }),
    );
  });

  it("hides the control for demo accounts with one plain line", () => {
    render(<ArchiveClientPanel businessId="demo-roofing" businessName="Demo Roofing" accountPurpose="demo" demo onChanged={vi.fn()} />);
    expect(screen.getByText("Demo accounts can't be archived.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Archive client" })).toBeNull();
  });

  it("surfaces the server's refusal instead of pretending the client was archived", async () => {
    const onChanged = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => respond({ error: "This client is not archived." }, 400)));

    render(<ArchiveClientPanel businessId="b" businessName="Fake Co" accountPurpose="archived" demo={false} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(await screen.findByText("This client is not archived.")).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

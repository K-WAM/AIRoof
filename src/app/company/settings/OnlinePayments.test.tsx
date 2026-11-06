// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OnlinePayments } from "./OnlinePayments";

const fetchMock = vi.fn();
const ready = { connected: true, chargesEnabled: true, ready: true, payNow: false, canConnect: true };
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const respond = (data: object) => ({ ok: true, json: async () => data });

it("read-only roles see status with no payment controls", async () => {
  fetchMock.mockResolvedValue(respond(ready));
  render(<OnlinePayments canEdit={false} />);
  expect(await screen.findByText("Stripe connected - ready for payments")).toBeVisible();
  expect(screen.getByText("Invoice Pay now is off.")).toBeVisible();
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("owner can switch Pay now on only when ready", async () => {
  fetchMock.mockResolvedValueOnce(respond(ready)).mockResolvedValueOnce(respond({ ...ready, payNow: true }));
  render(<OnlinePayments canEdit />);
  const toggle = await screen.findByRole("switch", { name: "Show a Pay now button on invoices" });
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PUT", body: JSON.stringify({ payNow: true }) });
});
it("unconfigured status prevents owner setup and opt-in", async () => {
  fetchMock.mockResolvedValue(respond({ ...ready, connected: false, ready: false, canConnect: false }));
  render(<OnlinePayments canEdit />);
  // Nothing the owner could use: one plain line instead of a disabled button and switch.
  expect(await screen.findByText(/Online payments are not available for this workspace yet\./)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Connect Stripe" })).toBeNull();
  expect(screen.queryByRole("switch")).toBeNull();
});

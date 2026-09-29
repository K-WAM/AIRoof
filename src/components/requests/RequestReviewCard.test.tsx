// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestReviewCard } from "./RequestReviewCard";

afterEach(cleanup);

const renderCard = (overrides: Partial<ComponentProps<typeof RequestReviewCard>> = {}) => {
  const onAccept = vi.fn().mockResolvedValue(undefined);
  const onDecline = vi.fn().mockResolvedValue(undefined);
  render(<RequestReviewCard
    request={{ status: "new", callerName: "Mina", callerPhone: "555-0100", address: "1 Main St", serviceRequested: "Repair" }}
    intakeLabelFor={(key) => key}
    jobNoun="job"
    canCreateJob
    onAccept={onAccept}
    onDecline={onDecline}
    {...overrides}
  />);
  return { onAccept, onDecline };
};

describe("RequestReviewCard", () => {
  // Owner, 2026-09-28: no picker — a booking is confirmed by what the caller gave on the call (email, text, or both).
  const booking = { status: "new", callerName: "Mina", callerPhone: "555-0100", address: "1 Main St", serviceType: "Repair", startTime: Date.UTC(2026, 9, 5, 15) };

  it("emails when the caller gave an email and texting is off — no picker, no AI call", async () => {
    const { onAccept } = renderCard({ request: { ...booking, callerEmail: "mina@example.com" } });
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText(/by email to/)).toHaveTextContent("mina@example.com");
    expect(screen.queryByText(/AI phone them/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm & email" }));
    await vi.waitFor(() => expect(onAccept).toHaveBeenCalledOnce());
  });

  it("emails AND texts when the caller gave both", async () => {
    renderCard({ smsEnabled: true, request: { ...booking, callerEmail: "mina@example.com", textOk: true } });
    expect(screen.getByText(/by email to/)).toHaveTextContent("and by text to");
    expect(screen.getByRole("button", { name: "Confirm & email + text" })).toBeInTheDocument();
  });

  it("with no email and no OK-to-text, says to phone them, with a tap-to-call link", async () => {
    const { onAccept } = renderCard({ request: booking });
    expect(screen.getByRole("link", { name: /phone them at \(555\) 0100|phone them at 555-0100/i })).toHaveAttribute("href", "tel:555-0100");
    fireEvent.click(screen.getByRole("button", { name: /Confirm & create job/i }));
    await vi.waitFor(() => expect(onAccept).toHaveBeenCalledOnce());
  });

  it("never texts someone who didn't say OK to text", () => {
    renderCard({ smsEnabled: true, request: { ...booking, callerEmail: "mina@example.com" } });
    expect(screen.getByRole("button", { name: "Confirm & email" })).toBeInTheDocument();
  });

  it("shows why an action failed instead of silently stopping", async () => {
    renderCard({ onAccept: vi.fn().mockRejectedValue(new Error("The call could not be started: Forbidden")) });
    fireEvent.click(screen.getByRole("button", { name: /Confirm & create job/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The call could not be started: Forbidden");
  });

  it("reveals the decline controls and sends the selected reason and custom message", async () => {
    const { onDecline } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Decline & notify/i }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Other" } });
    fireEvent.change(screen.getByPlaceholderText(/Optional note/i), { target: { value: "Please try another provider." } });
    fireEvent.click(screen.getByRole("button", { name: /Send decline/i }));
    await vi.waitFor(() => expect(onDecline).toHaveBeenCalledWith("Other", "Please try another provider."));
  });
});

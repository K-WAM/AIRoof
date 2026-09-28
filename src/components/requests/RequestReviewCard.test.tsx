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
  it("confirms the request and passes through the optional call notification", async () => {
    const { onAccept } = renderCard({ request: { status: "new", callerName: "Mina", callerPhone: "555-0100", callerEmail: "mina@example.com", address: "1 Main St", serviceRequested: "Repair" } });
    expect(screen.getByLabelText(/Have the AI phone them/i)).not.toBeChecked();
    fireEvent.click(screen.getByLabelText(/Have the AI phone them/i));
    fireEvent.click(screen.getByRole("button", { name: /Confirm & create job/i }));
    await vi.waitFor(() => expect(onAccept).toHaveBeenCalledWith(true));
  });

  it("starts with the confirmation call ticked when there is no email to confirm by", async () => {
    const { onAccept } = renderCard();
    expect(screen.getByLabelText(/Have the AI phone them to confirm \(no email on file\)/i)).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /Confirm & create job/i }));
    await vi.waitFor(() => expect(onAccept).toHaveBeenCalledWith(true));
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

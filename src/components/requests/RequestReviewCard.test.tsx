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
    const { onAccept } = renderCard();
    fireEvent.click(screen.getByLabelText(/Have the AI phone them/i));
    fireEvent.click(screen.getByRole("button", { name: /Confirm & create job/i }));
    await vi.waitFor(() => expect(onAccept).toHaveBeenCalledWith(true));
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

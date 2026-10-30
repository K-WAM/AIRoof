// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useBusinessModules", () => ({
  useBusinessModules: () => ({ calendarMode: "jobs", vocab: { resourceNoun: "Crew" } }),
}));

import { BookingDetails } from "../BookingDetails";

describe("BookingDetails (owner's 2026-10-19 call card)", () => {
  afterEach(() => cleanup());

  const booking = {
    callerPhone: "+18254887791",
    callbackPhone: "+15104537871",
    callerEmail: "k-w-a-m-w-a-d@gmail.com",
    notes: "Callback number: (510) 453-7871\nAccess: side gate",
    callSummary: "After clarifying the correct email address (K-W-A-M-W-A-D@gmail.com), the appointment was booked.",
  };

  it("leads with the number the caller asked to be reached on and says where they called from", () => {
    render(<BookingDetails booking={booking} />);
    expect(screen.getByRole("link", { name: "(510) 453-7871" })).toHaveAttribute("href", "tel:+15104537871");
    expect(screen.getByText(/called from \(825\) 488-7791/)).toBeInTheDocument();
    // The "Callback number:" line is the Phone row now — it is never printed twice.
    expect(screen.queryByText(/Callback number:/)).not.toBeInTheDocument();
    expect(screen.getByText("Access: side gate")).toBeInTheDocument();
  });

  it("shows and links a letter-by-letter email as the real address, in the field and in the summary", () => {
    render(<BookingDetails booking={booking} />);
    expect(screen.getByRole("link", { name: "kwamwad@gmail.com" })).toHaveAttribute("href", "mailto:kwamwad@gmail.com");
    expect(screen.getByText(/correct email address \(kwamwad@gmail.com\)/)).toBeInTheDocument();
    expect(screen.queryByText(/K-W-A-M-W-A-D/)).not.toBeInTheDocument();
  });

  it("shows caller ID alone when there is no separate callback number", () => {
    render(<BookingDetails booking={{ callerPhone: "+18254887791" }} />);
    expect(screen.getByRole("link", { name: "(825) 488-7791" })).toBeInTheDocument();
    expect(screen.queryByText(/called from/)).not.toBeInTheDocument();
  });
});

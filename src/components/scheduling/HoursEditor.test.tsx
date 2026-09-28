// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HoursEditor } from "./HoursEditor";

afterEach(cleanup);

describe("HoursEditor", () => {
  it("loads tolerant legacy hours and emits canonical values", () => {
    const onChange = vi.fn();
    render(<HoursEditor value="Mon-Fri 8-5" onChange={onChange} />);

    expect((screen.getByLabelText("Monday Open") as HTMLSelectElement).value).toBe("08:00");
    expect((screen.getByLabelText("Monday Close") as HTMLSelectElement).value).toBe("17:00");
    expect((screen.getByLabelText("Saturday Closed") as HTMLInputElement).checked).toBe(true);

    fireEvent.change(screen.getByLabelText("Monday Close"), { target: { value: "17:15" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      Monday: "08:00 - 17:15",
      Saturday: "Closed",
      Sunday: "Closed",
    }));
  });

  it("shows an inline error when closing is not after opening", () => {
    const onValidityChange = vi.fn();
    render(<HoursEditor value="Mon-Fri 8-5" onChange={() => {}} onValidityChange={onValidityChange} />);

    fireEvent.change(screen.getByLabelText("Monday Close"), { target: { value: "07:45" } });
    expect(screen.getByRole("alert").textContent).toContain("Closing time must be after opening time.");
    expect(screen.getByLabelText("Monday Close").getAttribute("aria-invalid")).toBe("true");
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });

  it("applies the 24-hour preset and keeps every row open", () => {
    const onChange = vi.fn();
    render(<HoursEditor value="Mon-Fri 8-5" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Open 24 hours (emergency service)" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      Monday: "00:00 - 24:00",
      Sunday: "00:00 - 24:00",
    }));
    expect((screen.getByLabelText("Sunday Closed") as HTMLInputElement).checked).toBe(false);
  });
});

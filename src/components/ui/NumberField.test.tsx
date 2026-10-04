// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { NumberField } from "./NumberField";

afterEach(cleanup);

function Harness({ min, onSave }: { min?: number; onSave?: (n: number) => void }) {
  const [v, setV] = useState(0);
  return <><NumberField label="Price" value={v} min={min} onCommit={setV} onBlur={() => onSave?.(v)} /><output>{v}</output></>;
}

function typeChars(input: HTMLElement, text: string) {
  let current = "";
  for (const ch of text) { current += ch; fireEvent.change(input, { target: { value: current } }); }
}

describe("NumberField", () => {
  it("12.50 stays 12.50 (it used to save as 1250)", () => {
    render(<Harness />);
    const box = screen.getByLabelText("Price");
    typeChars(box, "12.50");
    expect((box as HTMLInputElement).value).toBe("12.50");
    expect(screen.getByRole("status").textContent).toBe("12.5");
  });

  it("a pasted $1,250.00 becomes 1250, and leaving the box tidies it", () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    const box = screen.getByLabelText("Price");
    fireEvent.change(box, { target: { value: "$1,250.00" } });
    expect(screen.getByRole("status").textContent).toBe("1250");
    fireEvent.blur(box);
    expect((box as HTMLInputElement).value).toBe("1250");
    expect(onSave).toHaveBeenCalled();
  });

  it("an emptied box keeps the last good number; below the minimum is ignored", () => {
    render(<Harness min={1} />);
    const box = screen.getByLabelText("Price");
    typeChars(box, "3");
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.change(box, { target: { value: "0" } });
    expect(screen.getByRole("status").textContent).toBe("3");
    fireEvent.blur(box);
    expect((box as HTMLInputElement).value).toBe("3");
  });
});

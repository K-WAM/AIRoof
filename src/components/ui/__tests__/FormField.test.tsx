// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FormField } from "../FormField";

describe("FormField (T-163)", () => {
  afterEach(() => cleanup());

  it("renders a visible label associated with the control", () => {
    render(
      <FormField label="Company name">
        <input />
      </FormField>
    );
    expect(screen.getByLabelText("Company name")).toBeInTheDocument();
  });

  it("wires the hint through aria-describedby", () => {
    render(
      <FormField label="Company name" hint="As the caller hears it">
        <input />
      </FormField>
    );
    const input = screen.getByLabelText("Company name");
    const hint = screen.getByText("As the caller hears it");
    expect(input).toHaveAttribute("aria-describedby", hint.id);
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("wires an error to the control and announces it", () => {
    render(
      <FormField label="Email" hint="We never share it" error="Enter a valid email">
        <input type="email" />
      </FormField>
    );
    const input = screen.getByLabelText("Email");
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Enter a valid email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain(error.id);
    expect(input.getAttribute("aria-describedby")).toContain(screen.getByText("We never share it").id);
  });
});

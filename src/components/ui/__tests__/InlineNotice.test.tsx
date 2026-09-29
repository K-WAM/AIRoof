// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineNotice } from "../InlineNotice";

describe("InlineNotice (T-163)", () => {
  afterEach(() => cleanup());

  it("names the failure, the load time and offers Retry without hiding content", () => {
    const onRetry = vi.fn();
    const at = new Date(2026, 8, 28, 10, 42).getTime();
    render(<InlineNotice at={at} onRetry={onRetry} />);

    expect(screen.getByRole("status")).toHaveTextContent(/Couldn't refresh/);
    expect(screen.getByRole("status")).toHaveTextContent(/10:42/);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("omits Retry when there is nothing to retry", () => {
    render(<InlineNotice at={Date.now()} />);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("accepts a custom message", () => {
    render(<InlineNotice message="Couldn't refresh — showing the last loaded list" />);
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't refresh — showing the last loaded list");
  });
});

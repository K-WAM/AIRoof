// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  afterEach(cleanup);
  it("renders title and body", () => { render(<EmptyState title="Nothing here" body="Start with a call." />); expect(screen.getByText("Nothing here")).toBeInTheDocument(); expect(screen.getByText("Start with a call.")).toBeInTheDocument(); });
  it("renders a link action", () => { render(<EmptyState title="x" action={{ label: "Go", href: "/company/jobs" }} />); expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute("href", "/company/jobs"); });
  it("renders a click action", () => { const onClick = vi.fn(); render(<EmptyState title="x" action={{ label: "Add", onClick }} />); fireEvent.click(screen.getByRole("button", { name: "Add" })); expect(onClick).toHaveBeenCalledOnce(); });
  it("renders without actions and supports compact", () => { const { container } = render(<EmptyState title="Read only" compact />); expect(screen.queryByRole("button")).not.toBeInTheDocument(); expect(container.firstChild).toHaveClass("empty-state-compact"); });
});

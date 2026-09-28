// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  afterEach(cleanup);

  it("renders title and body", () => {
    render(<EmptyState title="Nothing here" body="Start with a call." />);
    expect(screen.getByRole("heading", { name: "Nothing here" })).toBeInTheDocument();
    expect(screen.getByText("Start with a call.")).toBeInTheDocument();
  });

  it("renders an href action as a primary link", () => {
    render(<EmptyState title="x" action={{ label: "Go", href: "/company/jobs" }} />);
    const link = screen.getByRole("link", { name: "Go" });
    expect(link).toHaveAttribute("href", "/company/jobs");
    expect(link).toHaveClass("button", "primary");
  });

  it("renders an onClick action as a primary button", () => {
    const onClick = vi.fn();
    render(<EmptyState title="x" action={{ label: "Add", onClick }} />);
    const button = screen.getByRole("button", { name: "Add" });
    expect(button).toHaveClass("button", "primary");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders the secondary action as a ghost, never a second primary", () => {
    render(<EmptyState title="x" action={{ label: "Main", onClick: () => {} }} secondary={{ label: "Other", onClick: () => {} }} />);
    expect(screen.getByRole("button", { name: "Other" })).toHaveClass("ghost");
    expect(screen.getByRole("button", { name: "Other" })).not.toHaveClass("primary");
    expect(document.querySelectorAll(".primary")).toHaveLength(1);
  });

  it("can render only a secondary action (inside a screen that already has its primary)", () => {
    render(<EmptyState title="x" secondary={{ label: "Show all", onClick: () => {} }} />);
    expect(screen.getByRole("button", { name: "Show all" })).toHaveClass("ghost");
    expect(document.querySelector(".primary")).toBeNull();
  });

  it("passes disabled through to a button action", () => {
    render(<EmptyState title="x" action={{ label: "Creating…", onClick: () => {}, disabled: true }} />);
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
  });

  it("renders no button at all without actions (the viewer case) and supports compact + testId", () => {
    const { container } = render(<EmptyState title="Read only" compact testId="empty-x" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container.firstChild).toHaveClass("empty-state", "empty-state-compact");
    expect(screen.getByTestId("empty-x")).toBeInTheDocument();
  });
});

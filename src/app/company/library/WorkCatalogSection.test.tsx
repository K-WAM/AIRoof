// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkCatalogSection } from "./WorkCatalogSection";

vi.mock("@/hooks/useBusinessModules", () => ({ useBusinessModules: () => ({ vocab: { workCatalogNoun: "Common fixes" } }) }));
afterEach(cleanup);
const catalog = { items: [{ itemId: "tile", category: "Tile roof", problem: "Cracked tiles", solution: "Replace the damaged tiles.", lines: [], createdAt: 1 }] };

describe("WorkCatalogSection visitor access", () => {
  it("a viewer can open categories and search fixes without edit or remove actions", () => {
    render(<WorkCatalogSection businessId="demo" catalog={catalog} readOnly onCatalogChange={vi.fn()} />);
    expect(screen.queryByText("Cracked tiles")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tile roof/ }));
    expect(screen.getByText("Cracked tiles")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit|Remove/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tile roof/ }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "cracked" } });
    expect(screen.getByText("Cracked tiles")).toBeInTheDocument();
  });

  it("office users still see the fixes and their edit controls immediately", () => {
    render(<WorkCatalogSection businessId="demo" catalog={catalog} onCatalogChange={vi.fn()} />);
    expect(screen.getByText("Cracked tiles")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Cracked tiles" })).toBeInTheDocument();
  });
});

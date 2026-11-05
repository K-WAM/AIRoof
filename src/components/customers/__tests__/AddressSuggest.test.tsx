// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { AddressSuggest } from "@/components/customers/AddressSuggest";

const suggestions = [
  { address: "300 Newest Road" },
  { address: "10 Example Way", city: "Miami", state: "FL", name: "Northside Plaza" },
];

function Harness({ customerId = "C-1", onSelect }: { customerId?: string | null; onSelect?: (s: { address: string }) => void }) {
  const [value, setValue] = useState("");
  return (
    <AddressSuggest
      businessId="biz-1"
      customerId={customerId}
      value={value}
      onChange={setValue}
      onSelect={onSelect}
      label="Address"
    />
  );
}

function mockFetch(items: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: items }) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AddressSuggest", () => {
  it("shows no list and never fetches until a customer is chosen", () => {
    const fetchMock = mockFetch(suggestions);
    render(<Harness customerId={null} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "10" } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("renders no list when the customer has no saved addresses", async () => {
    mockFetch([]);
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "10" } });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("prefills the only known address when the field is empty", async () => {
    mockFetch([{ address: "100 Only Road", city: "Miami", state: "FL" }]);
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await waitFor(() => expect(input).toHaveValue("100 Only Road"));
  });

  it("opens on focus, filters while typing, and picks with the keyboard", async () => {
    const onSelect = vi.fn();
    mockFetch(suggestions);
    render(<Harness onSelect={onSelect} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("10 Example Way");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ address: "10 Example Way", city: "Miami" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes on Escape and on blur", async () => {
    mockFetch(suggestions);
    render(<Harness />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.blur(input);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filters to what is typed and still allows free typing", async () => {
    mockFetch(suggestions);
    render(<Harness />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

    fireEvent.change(input, { target: { value: "northside" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);

    fireEvent.change(input, { target: { value: "12 Unlisted Lane" } });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("12 Unlisted Lane");
  });
});

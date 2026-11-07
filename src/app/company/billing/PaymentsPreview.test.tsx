// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentsPreview, type PaymentsPreviewInvoice } from "./PaymentsPreview";

const auth = vi.hoisted(() => ({user:{role:"owner",superadmin:false}}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>auth}));
vi.mock("@/hooks/useBusinessId",()=>({useBusinessId:()=>"sample"}));
vi.mock("next/navigation",()=>({useSearchParams:()=>new URLSearchParams()}));
vi.mock("@/hooks/useBusinessModules",()=>({useBusinessModules:()=>({isEnabled:()=>true})}));

const bootstrap = vi.hoisted(() => ({ current: { data: null as unknown } }));

vi.mock("@/contexts/BootstrapContext", () => ({
  useBootstrap: () => bootstrap.current,
}));

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function openPreview(){ const details=screen.getByText("See how customers would pay online").closest("details")!;details.open=true;fireEvent(details,new Event("toggle")); }

const invoices: PaymentsPreviewInvoice[] = [
  { invoiceId: "INV-1001", customer: "Acme Property Group", total: 1450, balance: 1450, status: "sent", daysLate: 0 },
  { invoiceId: "INV-1002", customer: "12 Palm Court", total: 900, balance: 300, status: "sent", daysLate: 12 },
  { invoiceId: "INV-1000", customer: "Northside Plaza", total: 4800, balance: 0, status: "paid", daysLate: 0 },
];

describe("PaymentsPreview", () => {
  beforeEach(() => {
    auth.user.role="owner";
    bootstrap.current = { data: { business: { businessName:"Our business", showcase: { payments: true, finances:true }, companies:[{id:"primary",name:"Default issuer",isDefault:true,logoUrl:"data:image/png;base64,a"}] } } };
    vi.stubGlobal("fetch", vi.fn(async (url:string) => new Response(JSON.stringify(url.includes("finance") ? {rows:[{source:"jobba",issuedAt:2,invoiceNo:"H-2",customer:"Recent customer",total:1200},{source:"jobba",issuedAt:1,invoiceNo:"H-1",customer:"Older customer",total:900}]} : {customers:[{name:"First customer"}]}),{status:200})));
  });

  it("opens a preview whose payment buttons are all disabled and say when payments turn on", async () => {
    render(<PaymentsPreview invoices={invoices} />);

    expect(screen.getByTestId("payments-preview")).toBeInTheDocument();
    expect(screen.getByText("Online payments")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("See how customers would pay online")).toBeInTheDocument();

    expect(fetch).not.toHaveBeenCalled();
    openPreview();
    await screen.findByText("Invoice H-2");
    expect(screen.getByText("Recent customer")).toBeInTheDocument();
    expect(screen.getByText("Default issuer")).toBeVisible();
    expect(screen.getByText("$1,200.00 due")).toBeVisible();
    openPreview();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Payments by Stripe")).toBeInTheDocument();
    expect(screen.getByText("Stripe charges a fee per payment; exact rates are confirmed at setup.")).toBeInTheDocument();

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent("Online payments turn on at launch.");
    }
    expect(screen.getByRole("button", { name: /Pay by bank \(ACH\)/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Pay by card/ })).toBeDisabled();
  });

  it("shows the office counts and a neutral sample deposit", () => {
    render(<PaymentsPreview invoices={invoices} />);

    expect(screen.getByText("Partly paid").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Overdue").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Paid").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Deposit: 50% of $0.00")).toBeInTheDocument();
  });

  it("uses the first customer for a role that cannot read Finances", async()=>{
    auth.user.role="staff";render(<PaymentsPreview invoices={invoices}/>);openPreview();
    await screen.findByText("First customer");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/api/company/customers?");
  });
  it("uses a neutral label when there is no imported invoice or customer",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({rows:[],customers:[]}))));
    render(<PaymentsPreview invoices={invoices}/>);openPreview();await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Your customer")).toBeInTheDocument();
    expect(screen.queryByText("Acme Property Group")).toBeNull();
  });
  it("is absent when the business's payments showcase switch is off", () => {
    for (const data of [null, { business: {} }, { business: { showcase: {} } }, { business: { showcase: { payments: false } } }]) {
      bootstrap.current = { data };
      const { unmount } = render(<PaymentsPreview invoices={invoices} />);
      expect(screen.queryByTestId("payments-preview")).not.toBeInTheDocument();
      expect(screen.queryByText("Online payments")).not.toBeInTheDocument();
      unmount();
    }
  });
});

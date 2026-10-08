"use client";

// What this client bought (owner, 2026-10-08): one switch per product, matching the contract. Each switch saves at
// once (audited server-side) and the client's screens and APIs follow within about 30 seconds. Definitions and the
// "billing needs jobs" rule live in src/lib/products/products.ts — this panel only renders them.

import { useState } from "react";
import { Package } from "lucide-react";
import { PRODUCTS, productsOf, type ProductId, type ProductSet } from "@/lib/products/products";

export function ProductsPanel({ businessId, stored }: { businessId: string; stored?: Partial<Record<ProductId, boolean>> }) {
  const [products, setProducts] = useState<ProductSet>(() => productsOf({ products: stored }));
  const [busy, setBusy] = useState<ProductId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function toggle(id: ProductId, on: boolean) {
    const change: Partial<ProductSet> = { [id]: on };
    // Turning Jobs off takes Billing with it (invoices belong to jobs) — say so before doing it.
    if (id === "field" && !on && products.billing) {
      if (!confirm("Billing needs Jobs & field input. Turn both off?")) return;
      change.billing = false;
    }
    // Flip at once (the switch follows the finger); the server's answer replaces it, or puts it back on failure.
    const before = products;
    setProducts({ ...products, ...change });
    setBusy(id);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: change }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setProducts(data.products as ProductSet);
      setSaved("Saved. The client sees the change within a minute.");
    } catch (err) {
      setProducts(before);
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  const onCount = PRODUCTS.filter((p) => products[p.id]).length;

  return (
    <section className="panel" id="products" aria-labelledby="products-title">
      <div className="panel-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="panel-title" id="products-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Package size={16} strokeWidth={1.75} />
          Products
        </h2>
        <span className="tag">{onCount} of {PRODUCTS.length} on</span>
      </div>
      <div className="panel-body">
        <p className="pb-note" style={{ margin: "0 0 12px" }}>Turn on what this client&apos;s contract includes. Each switch saves right away.</p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--sp-3)" }} data-testid="products-panel">
          {PRODUCTS.map((p) => {
            const blocked = p.requires ? !products[p.requires] : false;
            return (
              <li key={p.id}>
                <label className="check-row" style={{ alignItems: "flex-start", opacity: blocked ? 0.6 : 1 }}>
                  <input
                    type="checkbox"
                    checked={products[p.id]}
                    disabled={busy !== null || (blocked && !products[p.id])}
                    onChange={(e) => void toggle(p.id, e.target.checked)}
                    data-testid={`product-${p.id}`}
                  />
                  <span>
                    <strong>{p.label}</strong>
                    <br />
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {blocked ? `Needs ${PRODUCTS.find((x) => x.id === p.requires)?.label} first.` : p.includes}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {error && <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "#b91c1c" }}>{error}</p>}
        {saved && <p role="status" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-muted)" }}>{saved}</p>}
      </div>
    </section>
  );
}

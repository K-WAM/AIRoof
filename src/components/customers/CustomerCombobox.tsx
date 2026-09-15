"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { matchesQuery } from "@/lib/customers/search";
import type { CustomerSlim } from "@/types/customer";

interface Props {
  businessId: string | null;
  /** The name text — typing a novel name is a valid, first-class outcome (see collision note below). */
  value: string;
  onChangeText: (text: string) => void;
  /** Fired when an existing customer is picked — the caller fills phone/address and remembers customerId. */
  onSelect: (customer: CustomerSlim) => void;
  /** Fired when the text is edited after a customer was selected — the caller should clear customerId. */
  onClearSelection: () => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
}

/**
 * Simultaneously a free-text input and an instant search — per the Phase 2
 * plan's "job create form" collision note: customerId must never be
 * required (it would break the pipeline's one-tap appointment->job), so
 * typing a name that matches nothing is just... a new customer's name,
 * resolved in the background after the job is created
 * (POST /api/company/customers/resolve, wired up by the caller).
 */
export function CustomerCombobox({
  businessId, value, onChangeText, onSelect, onClearSelection, placeholder, label, required,
}: Props) {
  const [customers, setCustomers] = useState<CustomerSlim[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/company/customers?businessId=${businessId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.customers) setCustomers(d.customers); })
      .catch(() => {});
  }, [businessId]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const matches = useMemo(() => {
    if (!value.trim()) return [];
    return customers.filter((c) => matchesQuery(c, value)).slice(0, 8);
  }, [customers, value]);

  function pick(c: CustomerSlim) {
    onChangeText(c.name);
    onSelect(c);
    setOpen(false);
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {label && <label>{label}</label>}
      <input
        name="clientName"
        required={required}
        value={value}
        onChange={(e) => { onChangeText(e.target.value); onClearSelection(); setOpen(true); setHighlight(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && matches[highlight]) { e.preventDefault(); pick(matches[highlight]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
      />
      {open && matches.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30, marginTop: 4,
            background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(15,23,42,0.14)", maxHeight: 260, overflowY: "auto",
          }}
        >
          {matches.map((c, i) => (
            <button
              key={c.customerId}
              type="button"
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
                background: i === highlight ? "#f0f9ff" : "transparent", border: "none", cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{[c.phone, c.address].filter(Boolean).join(" · ") || `${c.jobCount} job${c.jobCount === 1 ? "" : "s"}`}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

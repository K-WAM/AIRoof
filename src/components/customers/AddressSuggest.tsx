"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filterAddressSuggestions, indexOfAddress, type AddressSuggestion } from "@/lib/customers/addressSuggest";

const EMPTY_SUGGESTIONS: AddressSuggestion[] = [];

interface Props {
  businessId: string | null;
  /** The picked customer. Without one there is nothing to suggest, so this is a plain input. */
  customerId: string | null;
  value: string;
  onChange: (value: string) => void;
  /** Fired after a suggestion is picked, so a form with city/state fields can fill them too. */
  onSelect?: (suggestion: AddressSuggestion) => void;
  label?: string;
  placeholder?: string;
  name?: string;
  required?: boolean;
}

/**
 * The job form's address input plus the addresses the business already has
 * for the chosen customer. Free typing is always allowed — the list is a
 * shortcut, never a gate. Opens on focus and while typing; closes on pick,
 * Escape or blur.
 */
export function AddressSuggest({
  businessId, customerId, value, onChange, onSelect, label, placeholder, name, required,
}: Props) {
  const [loaded, setLoaded] = useState<{ customerId: string; items: AddressSuggestion[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const prefilledRef = useRef(false);
  const listboxId = useId();

  useEffect(() => {
    setLoaded(null);
    prefilledRef.current = false;
    setOpen(false);
    if (!businessId || !customerId) return;

    let cancelled = false;
    fetch(`/api/company/customers/${encodeURIComponent(customerId)}?businessId=${encodeURIComponent(businessId)}&suggest=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !Array.isArray(d?.suggestions)) return;
        setLoaded({ customerId, items: d.suggestions as AddressSuggestion[] });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [businessId, customerId]);

  const suggestions = useMemo(
    () => (loaded?.customerId === customerId ? loaded.items : EMPTY_SUGGESTIONS),
    [customerId, loaded]
  );

  // Exactly one known address and an empty field: the system fills what it already knows.
  useEffect(() => {
    if (prefilledRef.current || !customerId || value.trim() || suggestions.length !== 1) return;
    prefilledRef.current = true;
    onChange(suggestions[0].address);
  }, [customerId, onChange, suggestions, value]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const matches = useMemo(() => filterAddressSuggestions(suggestions, value), [suggestions, value]);
  const expanded = open && matches.length > 0;

  function pick(suggestion: AddressSuggestion) {
    setOpen(false);
    onChange(suggestion.address);
    onSelect?.(suggestion);
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {label && <label>{label}</label>}
      <input
        {...(name ? { name } : {})}
        required={required}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(0); }}
        onFocus={() => { setOpen(true); setHighlight(Math.max(0, indexOfAddress(matches, value))); }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!expanded) {
            if (e.key === "Escape") setOpen(false);
            return;
          }
          if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && matches[highlight]) { e.preventDefault(); pick(matches[highlight]); }
          else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `${listboxId}-option-${highlight}` : undefined}
      />
      {expanded && (
        <div
          id={listboxId}
          role="listbox"
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30, marginTop: 4,
            background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(15,23,42,0.14)",
            maxHeight: "min(260px, 45vh)", overflowY: "auto", overscrollBehavior: "contain",
          }}
        >
          {matches.map((suggestion, i) => (
            <button
              key={`${suggestion.address}|${suggestion.city ?? ""}`}
              id={`${listboxId}-option-${i}`}
              type="button"
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => { e.preventDefault(); pick(suggestion); }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                display: "block", width: "100%", minHeight: 44, textAlign: "left", padding: "8px 12px",
                background: i === highlight ? "#f0f9ff" : "transparent", border: "none", cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{suggestion.address}</div>
              {(suggestion.name || suggestion.city || suggestion.state) && (
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {[suggestion.name, [suggestion.city, suggestion.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

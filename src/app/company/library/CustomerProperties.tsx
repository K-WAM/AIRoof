"use client";

import { useState } from "react";
import type { CustomerProperty } from "@/types/customer";

const INITIAL = 10;

export function CustomerProperties({ properties }: { properties?: CustomerProperty[] }) {
  const [expanded, setExpanded] = useState(false);
  const items = properties ?? [];
  if (items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, INITIAL);

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 10px" }}>
        Properties ({items.length})
      </h3>
      <div style={{ display: "grid", gap: 6 }}>
        {shown.map((property, index) => (
          <div
            key={property.sourceRef ?? `${property.address}-${index}`}
            style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8, minWidth: 0 }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {property.name || property.address}
            </div>
            <div style={{ fontSize: 11.5, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {[property.name ? property.address : undefined, property.city].filter(Boolean).join(", ")}
            </div>
          </div>
        ))}
      </div>
      {items.length > INITIAL && !expanded && (
        <button type="button" className="button ghost small" style={{ marginTop: 8 }} onClick={() => setExpanded(true)}>
          Show all {items.length}
        </button>
      )}
    </div>
  );
}

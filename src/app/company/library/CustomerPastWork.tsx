"use client";

import { useState } from "react";
import { useFormat } from "@/hooks/useFormat";


export interface CustomerHistoryItem {
  id: string;
  kind?: "inspection" | "work-order";
  description?: string;
  dueAt?: number;
  property?: string;
  address?: string;
  city?: string;
  jobType?: string;
  status: string;
}

const INITIAL = 10;

export function CustomerPastWork({ items }: { items: CustomerHistoryItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const fmt = useFormat();
  if (items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, INITIAL);

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 10px" }}>
        Past work from Jobba ({items.length})
      </h3>
      <div style={{ display: "grid", gap: 6 }}>
        {shown.map((item) => (
          <details key={item.id} style={{ padding: "8px 12px", background: "var(--bg-soft)", borderRadius: 8, minWidth: 0 }}>
            <summary style={{ minHeight: 44, cursor: "pointer", fontSize: 13, lineHeight: 1.6, overflowWrap: "anywhere" }}>
              {item.dueAt ? fmt.fmtDay(item.dueAt) : "No date"}
              {` · ${item.kind === "work-order" ? "Work order" : "Inspection"}`}
              {item.jobType ? ` · ${item.jobType}` : ""}
              {item.status ? ` · ${item.status}` : ""}
              {` · ${item.property || item.address || "No property"}`}
            </summary>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 13, lineHeight: 1.6, maxHeight: 240, overflowY: "auto", margin: "8px 0" }}>
              {item.description || "No description recorded."}
            </p>
          </details>
        ))}
      </div>
      {items.length > INITIAL && !expanded && (
        <button type="button" className="button ghost small" style={{ marginTop: 8 }} onClick={() => setExpanded(true)}>
          Show all ({items.length})
        </button>
      )}
    </div>
  );
}

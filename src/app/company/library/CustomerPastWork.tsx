"use client";

import { useState } from "react";
import { useFormat } from "@/hooks/useFormat";
import { StatusChip } from "@/components/ui/StatusChip";

export interface CustomerHistoryItem {
  id: string;
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
          <div
            key={item.id}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", background: "#f8fafc", borderRadius: 8, minWidth: 0 }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.property || item.address || "No property"}
              </div>
              <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
                {item.dueAt ? fmt.fmtDay(item.dueAt) : "No date"}
                {item.jobType ? ` · ${item.jobType}` : ""}
              </div>
            </div>
            <StatusChip status={item.status} />
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

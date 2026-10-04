"use client";

// "Work on this job" — what the inspector found and what to do about it, for the people doing the work (owner,
// 2026-10-04: "if accepted the quote becomes the work scope for the workers"). The ONE findings list on the field
// screens (the "+ Finding" button no longer draws its own copy). Quote-ticked findings first; never prices. Three
// items, then "Show all". Signed-in staff and QR users can add the inspector's comment ("north slope, ~12 tiles").

import { useEffect, useState } from "react";
import type { JobFinding } from "@/types/workCatalog";
import { FindingCommentRow } from "@/components/field/FindingPickerSheet";

export function WorkScope({ findings, businessId, jobId, canComment = true }: {
  findings?: JobFinding[];
  businessId: string | null;
  jobId: string | null;
  canComment?: boolean;
}) {
  const [all, setAll] = useState(false);
  const [notes, setNotes] = useState<Record<string, string | undefined>>({});
  useEffect(() => { setNotes({}); setAll(false); }, [jobId]);
  const items = [...(findings ?? [])].sort((a, b) => Number(b.includeInQuote) - Number(a.includeInQuote) || a.addedAt - b.addedAt);
  if (items.length === 0 || !jobId || !businessId) return null;
  const shown = all ? items : items.slice(0, 3);
  return (
    <section aria-label="Work on this job" data-testid="work-scope" style={{ margin: "0 0 20px" }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8" }}>Work on this job</h2>
      <div style={{ display: "grid", gap: 6 }}>
        {shown.map((f) => (
          <FindingCommentRow key={f.findingId} businessId={businessId} jobId={jobId} disabled={!canComment}
            finding={{ findingId: f.findingId, problem: f.problem, detail: f.solution, note: f.findingId in notes ? notes[f.findingId] : f.note }}
            onSaved={(note) => setNotes((prev) => ({ ...prev, [f.findingId]: note }))} />
        ))}
      </div>
      {items.length > 3 && (
        <button type="button" onClick={() => setAll((v) => !v)} style={{ marginTop: 6, background: "none", border: "none", padding: 0, color: "#5eead4", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {all ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}

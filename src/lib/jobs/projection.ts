// Deterministic job-data projection (event-sourcing-lite).
//
// The `updates` subcollection is an immutable ledger. `buildProjection` folds it
// into the authoritative `job.parsed` state. THE LLM IS NEVER IN THIS ARITHMETIC PATH —
// it only extracts line items and flags corrections; all summation happens here, in code,
// so a correction can never silently wipe prior days' quantities.

import type {
  FieldUpdate,
  ParsedUpdate,
  FieldMaterial,
  FieldLaborEntry,
  FieldTimelineEvent,
} from "@/types/jobs";

function normalizeItem(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// override key: which (ledger entry, field, item) a correction targets
function ovKey(updateId: string, field: string, item: string): string {
  return `${updateId}|${field}|${normalizeItem(item)}`;
}

/**
 * Fold the ledger into the authoritative ParsedUpdate.
 * - Materials: grouped by normalized name, quantities SUMMED across entries (with corrections applied first).
 * - Labor: each worker-shift kept as its own line (hours corrected where overridden).
 * - Timeline / issues / invoiceSuggestions: concatenated in ledger order (timeline sorted by time when present).
 */
export function buildProjection(updatesInput: FieldUpdate[]): ParsedUpdate {
  const updates = [...updatesInput].sort((a, b) => a.createdAt - b.createdAt);

  // 1. Collect corrections into an override map (last correction for a key wins).
  const overrides = new Map<string, number>();
  for (const u of updates) {
    if (u.kind === "correction" && u.targetUpdateId && u.correctionItem && typeof u.correctionNewValue === "number") {
      overrides.set(ovKey(u.targetUpdateId, u.correctionField ?? "materials", u.correctionItem), u.correctionNewValue);
    }
  }

  const normal = updates.filter((u) => u.kind !== "correction" && u.parsed);

  // 2. Materials — sum by normalized name, applying per-entry overrides.
  const matByName = new Map<string, { item: string; quantity: number; unit?: string; cost: number; hasCost: boolean }>();
  for (const u of normal) {
    for (const m of u.parsed!.materials) {
      const key = normalizeItem(m.item);
      const ov = overrides.get(ovKey(u.updateId, "materials", m.item));
      const qty = ov != null ? ov : toNum(m.quantity);
      const existing = matByName.get(key);
      if (existing) {
        existing.quantity += qty;
        if (m.cost != null) { existing.cost += m.cost; existing.hasCost = true; }
        if (!existing.unit && m.unit) existing.unit = m.unit;
      } else {
        matByName.set(key, { item: m.item, quantity: qty, unit: m.unit, cost: m.cost ?? 0, hasCost: m.cost != null });
      }
    }
  }
  const materials = [...matByName.values()].map((m) => ({
    item: m.item,
    quantity: String(m.quantity),
    unit: m.unit,
    ...(m.hasCost ? { cost: m.cost } : {}),
  }));

  // 3. Labor — keep each worker-shift; apply hours override per (entry, worker).
  const labor: ParsedUpdate["labor"] = [];
  for (const u of normal) {
    for (const l of u.parsed!.labor) {
      const ov = overrides.get(ovKey(u.updateId, "labor", l.description));
      labor.push(ov != null ? { ...l, hours: ov } : { ...l });
    }
  }

  // 4. Timeline — concat, stamping each event with its source update's day so multi-day
  //    jobs can show the date. Sort by day, then by time within the day.
  const timeline = normal
    .flatMap((u) => u.parsed!.timeline.map((t) => ({ ...t, dateMs: t.dateMs ?? u.createdAt })))
    .sort((a, b) => {
      const d = (a.dateMs ?? 0) - (b.dateMs ?? 0);
      return d !== 0 ? d : (a.time ?? "").localeCompare(b.time ?? "");
    });

  // 5. Issues — concat, dedupe identical descriptions (keep first, preserve resolution).
  const seen = new Set<string>();
  const issues: ParsedUpdate["issues"] = [];
  for (const u of normal) {
    for (const i of u.parsed!.issues) {
      const k = normalizeItem(i.description);
      if (seen.has(k)) continue;
      seen.add(k);
      issues.push(i);
    }
  }

  // 6. Invoice suggestions — concat.
  const invoiceSuggestions = normal.flatMap((u) => u.parsed!.invoiceSuggestions ?? []);

  return { timeline, materials, labor, issues, invoiceSuggestions };
}

/** Current summed quantity for a material across the ledger (corrections applied). */
function materialTotal(updates: FieldUpdate[], item: string): number {
  return toNum(buildProjection(updates).materials.find((m) => normalizeItem(m.item) === normalizeItem(item))?.quantity);
}

/**
 * Resolve a correction against the ledger: find the most recent normal entry containing `item`,
 * compute old value + the new running total if the override were applied. Pure / code-only.
 * Returns null if no matching entry exists (caller should fall back to saving a normal note).
 */
export function resolveCorrection(
  updates: FieldUpdate[],
  item: string,
  newValue: number,
  field: "materials" | "labor" = "materials"
): { targetUpdateId: string; oldValue: number; newValue: number; currentTotal: number; newTotal: number } | null {
  const sorted = [...updates].filter((u) => u.kind !== "correction" && u.parsed).sort((a, b) => b.createdAt - a.createdAt);
  const target = sorted.find((u) =>
    (field === "materials" ? u.parsed!.materials.map((m) => m.item) : u.parsed!.labor.map((l) => l.description))
      .some((n) => normalizeItem(n) === normalizeItem(item))
  );
  if (!target) return null;

  const line =
    field === "materials"
      ? target.parsed!.materials.find((m) => normalizeItem(m.item) === normalizeItem(item))
      : target.parsed!.labor.find((l) => normalizeItem(l.description) === normalizeItem(item));
  const oldValue = field === "materials" ? toNum((line as { quantity?: string })?.quantity) : toNum((line as { hours?: number })?.hours);

  const currentTotal = field === "materials" ? materialTotal(updates, item) : laborHoursTotal(updates, item);

  // Simulate the override by appending a correction event and recomputing.
  const simulated: FieldUpdate[] = [
    ...updates,
    {
      updateId: "__sim__",
      kind: "correction",
      rawText: "",
      createdAt: Date.now(),
      targetUpdateId: target.updateId,
      correctionField: field,
      correctionItem: item,
      correctionNewValue: newValue,
    },
  ];
  const newTotal = field === "materials" ? materialTotal(simulated, item) : laborHoursTotal(simulated, item);

  return { targetUpdateId: target.updateId, oldValue, newValue, currentTotal, newTotal };
}

function laborHoursTotal(updates: FieldUpdate[], worker: string): number {
  return buildProjection(updates)
    .labor.filter((l) => normalizeItem(l.description) === normalizeItem(worker))
    .reduce((s, l) => s + (l.hours ?? 0), 0);
}

/** Map the authoritative projection to the legacy FieldLog shape so /company/field JobLogCard works unchanged. */
export function parsedToFieldLog(p: ParsedUpdate | undefined): {
  materials: FieldMaterial[];
  laborEntries: FieldLaborEntry[];
  timelineEvents: FieldTimelineEvent[];
  fieldNotes: string[];
  totalLaborHours: number;
} {
  if (!p) return { materials: [], laborEntries: [], timelineEvents: [], fieldNotes: [], totalLaborHours: 0 };
  const laborEntries: FieldLaborEntry[] = p.labor.map((l) => ({
    workerName: l.description,
    timeIn: l.arrivalTime,
    timeOut: l.departureTime,
    hours: l.hours,
  }));
  return {
    materials: p.materials.map((m) => ({ name: m.item, quantity: toNum(m.quantity), unit: m.unit ?? "units" })),
    laborEntries,
    timelineEvents: p.timeline.map((t) => ({ eventType: "other", time: t.time, notes: t.description })),
    fieldNotes: p.issues.map((i) => `[${i.severity.toUpperCase()}] ${i.description}`),
    totalLaborHours: laborEntries.reduce((s, e) => s + (e.hours ?? 0), 0),
  };
}

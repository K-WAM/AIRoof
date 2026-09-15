"use client";

import { useEffect } from "react";
import { invalidate } from "@/lib/data/store";
import type { Tag } from "@/lib/data/tags";

/** Entities the global quick-add can create. Extend this union (and
 * QuickAddPanel's KIND_TITLE/menu) when a new kind is added — never gate a
 * new create-flow on a separate ad hoc mechanism. */
export type QuickAddKind = "job" | "crew" | "teammate" | "material";

export interface QuickAddCreatedDetail {
  kind: QuickAddKind;
  id?: string;
}

const EVENT_NAME = "luxor:quickadd-created";

// Maps a quick-add kind onto the src/lib/data/store.ts tag any useQuery-based
// reader of that kind would have tagged its cache entry with. This lets a
// page migrated onto useQuery (see src/hooks/useQuery.ts) get quick-add
// invalidation for free, without touching pages that still use their own
// fetch-on-event handler below.
const KIND_TAG: Record<QuickAddKind, Tag> = {
  job: "jobs",
  crew: "crews",
  teammate: "team",
  material: "library",
};

/**
 * Fired once a quick-add form successfully creates something, so any page
 * already showing a list of that kind (Jobs, Library's crew roster, Settings'
 * Team panel, Calendar's crew rows) can refetch in place — a small pub/sub
 * instead of lifting state through the whole company shell just so a modal
 * that can open from any page can tell one specific page to refresh.
 */
export function emitQuickAddCreated(detail: QuickAddCreatedDetail) {
  window.dispatchEvent(new CustomEvent<QuickAddCreatedDetail>(EVENT_NAME, { detail }));
  invalidate(KIND_TAG[detail.kind]);
}

/** Low-level subscribe; prefer the `useQuickAddRefresh` hook below in components. */
export function onQuickAddCreated(handler: (detail: QuickAddCreatedDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<QuickAddCreatedDetail>).detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

/**
 * Re-run `onCreated` whenever the global quick-add creates something of
 * `kind` — including from this same page's own form, which keeps every
 * consumer's refresh logic in one place instead of special-casing "did I
 * create this myself." Cheap to resubscribe, so `onCreated` need not be
 * memoized by the caller.
 */
export function useQuickAddRefresh(kind: QuickAddKind, onCreated: () => void) {
  useEffect(() => onQuickAddCreated((d) => {
    if (d.kind === kind) onCreated();
  }), [kind, onCreated]);
}

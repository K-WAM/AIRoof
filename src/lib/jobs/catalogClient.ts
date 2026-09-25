import type { WorkCatalogItem, WorkCatalogLine, WorkSeverity } from "@/types/workCatalog";

export interface NewCatalogItem {
  category: string;
  problem: string;
  solution: string;
  severity?: WorkSeverity;
  lines?: WorkCatalogLine[];
}

/** Category used for anything a user saves to the Library from a job or quote ("Save to Library"). */
export const SAVED_FROM_JOBS_CATEGORY = "Saved from jobs";

/** Appends one item to the tenant's Library (work catalog) and returns it with its server-assigned id. */
export async function saveToLibrary(businessId: string, item: NewCatalogItem): Promise<WorkCatalogItem> {
  const res = await fetch("/api/company/work-catalog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ businessId, item }),
  });
  const data = await res.json().catch(() => ({} as { error?: string; item?: WorkCatalogItem }));
  if (!res.ok || !data.item) throw new Error(data.error ?? "Could not save to the Library");
  return data.item as WorkCatalogItem;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkCatalog, WorkCatalogItem } from "@/types/workCatalog";

/**
 * Loads the tenant's Library work catalog ONCE for the job page and shares it between the Findings and Quote tabs
 * (they used to fetch it separately). `remember` folds a freshly-saved Library item into the local list so it
 * shows up in both places without a refetch.
 */
export function useWorkCatalog(businessId: string | null | undefined) {
  const [items, setItems] = useState<WorkCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    let live = true;
    setLoading(true);
    setError(false);
    fetch(`/api/company/work-catalog?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("catalog"))))
      .then((d: { catalog: WorkCatalog }) => { if (live) setItems(d.catalog?.items ?? []); })
      .catch(() => { if (live) setError(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [businessId]);

  const remember = useCallback((item: WorkCatalogItem) => {
    setItems((prev) => (prev.some((existing) => existing.itemId === item.itemId) ? prev : [...prev, item]));
  }, []);

  return { items, loading, error, remember };
}

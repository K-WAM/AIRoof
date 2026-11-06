import type { LibraryPricing } from "@/types/library";

/**
 * A stored price list may lack a list (2026-11-06: the Jobba import wrote materials only, and the Library screen
 * crashed reading `laborRates.length`). Every list is always an array here, whatever the stored document holds.
 */
export function normalizePricing(data: Partial<LibraryPricing> | undefined | null): LibraryPricing {
  if (!data) return { materials: [], laborRates: [], documents: [] };
  return {
    ...data,
    materials: Array.isArray(data.materials) ? data.materials : [],
    laborRates: Array.isArray(data.laborRates) ? data.laborRates : [],
    documents: Array.isArray(data.documents) ? data.documents : [],
  };
}

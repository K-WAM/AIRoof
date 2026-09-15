// Invalidation tags for the client data-cache layer (src/lib/data/store.ts).
// A generalization of the same idea already proven by
// src/lib/events/quickAdd.ts (`useQuickAddRefresh("crew"|"material"|...)`):
// a page registers what it read, a mutation somewhere else says what kind of
// thing it changed, and every reader of that kind refetches — without
// lifting state through the whole company shell.
export type Tag =
  | "bootstrap"
  | "jobs"
  | "job"
  | "customers"
  | "customer"
  | "leads"
  | "appointments"
  | "calls"
  | "library"
  | "crews"
  | "team"
  | "photos"
  | "invoice"
  | "punches";

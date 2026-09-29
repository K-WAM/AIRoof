export interface BizRow {
  businessId: string;
  businessName: string;
  industry: string;
  active: boolean;
  vapiAssistantId?: string;
  contactPhone?: string;
  notificationEmail?: string;
  serviceArea?: string[];
  createdAt: number;
  subscriptionStatus?: "active" | "paused" | "trial";
  /** Contract C-A: the server's classification (demo derived, missing = "unclassified"), not the stored field. */
  accountPurpose?: string | null;
}

export type BusinessesLoadResult =
  | { status: "success"; businesses: BizRow[] }
  | { status: "error" };

export async function loadBusinesses(
  fetchImpl: typeof fetch = fetch
): Promise<BusinessesLoadResult> {
  try {
    const response = await fetchImpl("/api/admin/businesses");
    if (!response.ok) throw new Error("Businesses request failed");
    const data = await response.json();
    return {
      status: "success",
      businesses: (data.businesses ?? []).map(
        (row: { business: BizRow; accountPurpose?: string }) => ({ ...row.business, accountPurpose: row.accountPurpose ?? row.business.accountPurpose })
      ),
    };
  } catch {
    return { status: "error" };
  }
}

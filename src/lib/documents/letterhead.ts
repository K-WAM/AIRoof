import { logoDataUri, logoStyle, pickDefaultLogo } from "@/lib/branding/logo";
import type { LibraryLogo } from "@/types/library";
import type { BusinessConfig } from "@/types";

export type LetterheadBusiness = Partial<Pick<BusinessConfig, "businessName" | "brandColor" | "logoUrl" | "address" | "contactPhone" | "contactEmail" | "websiteUrl" | "licenseNumber">>;
export interface Letterhead extends LetterheadBusiness { logoStyle: ReturnType<typeof logoStyle> }

export function resolveLetterhead(business: LetterheadBusiness, logos: LibraryLogo[] = [], surface: "light" | "brand-bar" = "light"): Letterhead {
  const logo = pickDefaultLogo(logos);
  return { ...business, logoUrl: logo ? logoDataUri(logo) : business.logoUrl ?? null, logoStyle: logo ? logoStyle(logo, surface) : {} };
}

export async function resolveEmailLogo(db: FirebaseFirestore.Firestore, businessId: string): Promise<string | null> {
  const [business, library] = await Promise.all([
    db.collection("businesses").doc(businessId).get(),
    db.collection(`businesses/${businessId}/library`).doc("logos").get(),
  ]);
  return resolveLetterhead(business.data() ?? {}, (library.data()?.logos as LibraryLogo[] | undefined) ?? []).logoUrl ?? null;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

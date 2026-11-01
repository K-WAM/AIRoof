import { getFirebaseAuth } from "@/lib/firebase/client";

export interface OfflineIdentity { uid: string; businessId?: string; preview?: boolean }
let identity: OfflineIdentity | null = null;
let revision = 0;
export function setOfflineIdentity(next: OfflineIdentity | null) { identity = next; revision++; }
export function offlineIdentity() { return identity; }
export function identityRevision() { return revision; }

// QR pages have no AuthProvider. Never invent a shared "anonymous" queue.
export async function fieldIdentity(): Promise<OfflineIdentity | null> {
  const auth = await getFirebaseAuth();
  if (auth?.currentUser) {
    if (identity?.uid === auth.currentUser.uid) return identity;
    return null; // wait until the profile (including preview status) is resolved
  }
  if (identity && !identity.uid.startsWith("field:")) return null;
  try {
    const res = await fetch("/api/field/session", { cache: "no-store" });
    if (!res.ok) { setOfflineIdentity(null); sessionStorage.removeItem("luxor-offline-field"); return null; }
    const session = await res.json();
    if (!session.offlineOwner) return null;
    const next = { uid: session.offlineOwner, businessId: session.businessId };
    sessionStorage.setItem("luxor-offline-field", JSON.stringify(next));
    identity = next;
    return next;
  } catch {
    try {
      const saved = JSON.parse(sessionStorage.getItem("luxor-offline-field") ?? "null");
      return saved?.uid?.startsWith("field:") ? saved : null;
    } catch { return null; }
  }
}

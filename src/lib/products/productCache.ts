// 30 s in-process memo of each client's products, so the server check costs one document read per client per warm
// instance — not one per request (Spark plan: reads are scarce; owner: "don't slow down the app pages").
// A superadmin change applies at once on the instance that saved it and within 30 s everywhere else.
import type { Firestore } from "firebase-admin/firestore";
import { productsOf, type ProductSet } from "./products";

const TTL_MS = 30_000;
const cache = new Map<string, { products: ProductSet; exp: number }>();

export async function loadProducts(db: Firestore, businessId: string): Promise<ProductSet> {
  const hit = cache.get(businessId);
  if (hit && hit.exp > Date.now()) return hit.products;
  const snap = await db.collection("businesses").doc(businessId).get();
  const products = productsOf(snap.data() as { products?: Record<string, unknown> } | undefined);
  if (cache.size > 500) cache.clear();
  cache.set(businessId, { products, exp: Date.now() + TTL_MS });
  return products;
}

export function invalidateProducts(businessId: string): void {
  cache.delete(businessId);
}

// 30 s in-process memo of each client's products, so the server check costs one document read per client per warm
// instance — not one per request (Spark plan: reads are scarce; owner: "don't slow down the app pages").
// A superadmin change applies at once on the instance that saved it and within 30 s everywhere else.
import type { Firestore } from "firebase-admin/firestore";
import { productsOf, type ProductSet } from "./products";

const TTL_MS = 30_000;
interface Cached { products: ProductSet; business: Record<string, unknown>; exp: number }
const cache = new Map<string, Cached>();

/**
 * The same read the product guard already makes, reused by callers that also need the business document (e.g. the
 * Billing route's company list). Returns the products and the document data captured by that one read.
 */
export async function loadBusinessConfig(
  db: Firestore,
  businessId: string,
): Promise<{ products: ProductSet; business: Record<string, unknown> }> {
  const hit = cache.get(businessId);
  if (hit && hit.exp > Date.now()) return { products: hit.products, business: hit.business };
  const snap = await db.collection("businesses").doc(businessId).get();
  const business = (snap.data() ?? {}) as Record<string, unknown>;
  const products = productsOf(business as { products?: Record<string, unknown> });
  if (cache.size > 500) cache.clear();
  cache.set(businessId, { products, business, exp: Date.now() + TTL_MS });
  return { products, business };
}

export async function loadProducts(db: Firestore, businessId: string): Promise<ProductSet> {
  return (await loadBusinessConfig(db, businessId)).products;
}

export function invalidateProducts(businessId: string): void {
  cache.delete(businessId);
}

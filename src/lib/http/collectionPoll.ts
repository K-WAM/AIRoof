import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { VerifiedUser } from "@/lib/auth/verifyRole";

/** Call only AFTER authorization. Opt-in list polling costs two latest-document reads plus a count aggregation
 * instead of rereading a large unchanged collection. Updated timestamps catch edits, creation catches legacy
 * records without updatedAt, and the count catches deletion. No process cache, new index or write-path changes.
 */
export async function collectionPoll(req: NextRequest, collection: FirebaseFirestore.CollectionReference,
  reader: Pick<VerifiedUser, "uid" | "role" | "crewId">) {
  const previous = req.nextUrl.searchParams.get("pollVersion");
  if (previous === null) return { version: undefined, unchanged: false };
  const [count, updated, created] = await Promise.all([
    collection.count().get(),
    collection.orderBy("updatedAt", "desc").limit(1).get(),
    collection.orderBy("createdAt", "desc").limit(1).get(),
  ]);
  const stamp = (snap: FirebaseFirestore.QuerySnapshot, field: string) => {
    const doc = snap.docs[0];
    return doc ? [doc.id, doc.data()[field], doc.updateTime?.toMillis()] : null;
  };
  const scope = new URL(req.url);
  scope.searchParams.delete("pollVersion");
  const version = createHash("sha256").update(JSON.stringify([
    scope.pathname, scope.search, reader.uid, reader.role, reader.crewId,
    count.data().count, stamp(updated, "updatedAt"), stamp(created, "createdAt"),
  ])).digest("hex");
  return { version, unchanged: previous === version };
}

import { NextRequest } from "next/server";
import { verifyIdToken, getAdminFirestore } from "@/lib/firebase/admin";
import { evictViewAs, viewAsId, viewAsCookieOptions, VIEW_AS_COOKIE } from "@/lib/auth/viewAs";
import { jsonWithCache } from "@/lib/http/cache";

/** Sign-out must clear HttpOnly cookies on the server, even when the auth token has already expired. */
export async function DELETE(req: NextRequest) {
  const token = req.cookies.get("__session")?.value;
  const decoded = token ? await verifyIdToken(token) : null;
  const id = viewAsId(req);
  if (id) {
    const db = getAdminFirestore();
    if (db && decoded) {
      const ref = db.collection("viewAsSessions").doc(id);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const session = snap.data();
        if (session?.uid === decoded.uid && session.endedAt === null) tx.update(ref, { endedAt: Date.now() });
      });
    }
    evictViewAs(id);
  }
  const response = jsonWithCache({ success: true }, "noStore");
  response.cookies.set(VIEW_AS_COOKIE, "", { ...viewAsCookieOptions(), maxAge: 0 });
  response.cookies.set("__session", "", { path: "/", maxAge: 0 });
  return response;
}

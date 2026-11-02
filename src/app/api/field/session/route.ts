import { fieldOfflineOwner } from "@/lib/offline/serverOwner";
import { NextRequest, NextResponse } from "next/server";
import { peekFieldSessionClaims, verifyFieldAccess } from "@/lib/auth/verifyRole";

// GET /api/field/session — lets the /field client learn its businessId/jobId
// from the HttpOnly field-session cookie instead of the URL, so the address
// bar can stay a bare "/field" after the QR exchange redirect. See
// Validate the field credential too: an already-open phone uses this cheap read to detect key rotation.
export async function GET(req: NextRequest) {
  const claims = peekFieldSessionClaims(req);
  if (!claims) return NextResponse.json({ error: "No field session" }, { status: 401 });
  // Select the field credential even when this device also has an office login, exactly as field-owned outbox
  // requests do. The ordinary guard checks signature, expiry, job scope and CURRENT business key.
  const headers = new Headers(req.headers);
  headers.set("x-offline-owner", fieldOfflineOwner(req));
  const gate = await verifyFieldAccess(new NextRequest(req.url, { headers }), claims.businessId, { jobId: claims.jobId });
  if ("error" in gate) return gate.error;
  return NextResponse.json(
    { businessId: claims.businessId, jobId: claims.jobId ?? null, offlineOwner: fieldOfflineOwner(req) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

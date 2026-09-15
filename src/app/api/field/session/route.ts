import { NextRequest, NextResponse } from "next/server";
import { peekFieldSessionClaims } from "@/lib/auth/verifyRole";

// GET /api/field/session — lets the /field client learn its businessId/jobId
// from the HttpOnly field-session cookie instead of the URL, so the address
// bar can stay a bare "/field" after the QR exchange redirect. See
// peekFieldSessionClaims's doc comment: this is a convenience read, not an
// authorization check — every subsequent API call the page makes is itself
// gated by verifyFieldAccess.
export async function GET(req: NextRequest) {
  const claims = peekFieldSessionClaims(req);
  if (!claims) return NextResponse.json({ error: "No field session" }, { status: 401 });
  return NextResponse.json(
    { businessId: claims.businessId, jobId: claims.jobId ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

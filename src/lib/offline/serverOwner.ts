import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export function fieldOfflineOwner(req: NextRequest): string {
  return `field:${createHash("sha256").update(req.cookies.get("__field_access")?.value ?? "").digest("hex")}`;
}

/** Extra account-switch protection for durable browser requests; never replaces the route's access gate. */
export function checkOfflineOwner(req: NextRequest, user: { uid: string; superadmin?: boolean }) {
  const owner = req.headers.get("x-offline-owner");
  if (!owner) return null;
  const expected = user.uid.startsWith("field:") ? fieldOfflineOwner(req) : user.uid;
  if (owner !== expected || user.superadmin) return NextResponse.json({ error: "This saved entry belongs to a different session. Sign back in to send it." }, { status: 403 });
  return null;
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole, verifyOwnBusinessRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { foldPunches } from "@/lib/timeclock/fold";
import { summarizePayroll } from "@/lib/payroll/summary";
import type { Punch } from "@/types/timeclock";

function parseDate(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}
export async function GET(req: NextRequest) {
  const own = await verifyOwnBusinessRole(req, ["owner"]);
  let businessId = "error" in own ? "" : own.user.businessId ?? "";
  if (!businessId) {
    const preview = req.nextUrl.searchParams.get("businessId");
    if (!preview) return "error" in own ? own.error : NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const gate = await verifyAuthAndRole(req, preview, ["owner"]);
    if ("error" in gate || !gate.user.superadmin) return "error" in own ? own.error : NextResponse.json({ error: "Forbidden" }, { status: 403 });
    businessId = preview;
  }
  const periodStart = req.nextUrl.searchParams.get("periodStart"); const periodEnd = req.nextUrl.searchParams.get("periodEnd");
  const from = parseDate(periodStart); const to = parseDate(periodEnd);
  if (from === null || to === null || to < from || to - from >= 31 * 86400000) return NextResponse.json({ error: "Choose a period of at most 31 days" }, { status: 400 });
  const db = getAdminFirestore(); if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const business = db.collection("businesses").doc(businessId); const snap = await business.get();
  if (!snap.exists || snap.data()?.showcase?.payroll !== true) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [punches, members, crewDocs] = await Promise.all([
    business.collection("punches").where("dayKey", ">=", periodStart!).where("dayKey", "<=", periodEnd!).limit(5000).get(),
    db.collection("businessUsers").where("businessId", "==", businessId).limit(2000).get(),
    business.collection("crews").limit(2000).get(),
  ]);
  const names = new Map(crewDocs.docs.map((doc) => [doc.id, doc.data().name as string]));
  const crews: Record<string, string> = {};
  for (const member of members.docs) { const crew = names.get(member.data().crewId as string); if (crew) crews[`uid:${member.id}`] = crew; }
  const rows = punches.docs.map((doc) => ({ ...doc.data(), punchId: doc.id }) as Punch);
  const days = foldPunches(rows, Date.now(), snap.data()?.timezone || "America/New_York");
  const superseded = new Set(rows.map((p) => p.supersedes).filter(Boolean));
  return jsonWithCache({ timezone: snap.data()?.timezone || "America/New_York", ...summarizePayroll(days, { periodStart: periodStart!, periodEnd: periodEnd!, crews }), days, punches: rows.filter((p) => !superseded.has(p.punchId)).map(({ workerKey, dayKey, type, at, jobId }) => ({ workerKey, dayKey, type, at, jobId })), capped: punches.size >= 5000 }, "semiStatic");
}

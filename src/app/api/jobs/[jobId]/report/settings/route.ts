import { NextRequest } from "next/server";
import { verifyOwnBusinessRole } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { jsonWithCache } from "@/lib/http/cache";
import type { ReportLetterOptions } from "@/types/documentTemplate";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const gate = await verifyOwnBusinessRole(req, ["owner", "staff"]);
  if ("error" in gate) return gate.error;
  const body = await req.json().catch(() => null) as ReportLetterOptions | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonWithCache({ error: "Invalid report settings" }, "noStore", { status: 400 });
  if (body.layout !== undefined && !["report", "inspection_completion", "repair_completion"].includes(body.layout)) return jsonWithCache({ error: "Invalid report layout" }, "noStore", { status: 400 });
  if (body.noCharge !== undefined && typeof body.noCharge !== "boolean") return jsonWithCache({ error: "Invalid no charge choice" }, "noStore", { status: 400 });
  for (const key of ["locations", "approvalDate", "attention", "poNumber"] as const) if (body[key] !== undefined && (typeof body[key] !== "string" || body[key]!.length > 4000)) return jsonWithCache({ error: `Invalid ${key}` }, "noStore", { status: 400 });
  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });
  const { jobId } = await params;
  const ref = db.collection(`businesses/${gate.user.businessId}/jobs`).doc(jobId);
  const snap = await ref.get();
  if (!snap.exists) return jsonWithCache({ error: "Job not found" }, "noStore", { status: 404 });
  const settings = Object.fromEntries(["layout", "noCharge", "locations", "approvalDate", "attention", "poNumber"].filter(k => body[k as keyof ReportLetterOptions] !== undefined).map(k => [k, body[k as keyof ReportLetterOptions]]));
  const reportDocument = { ...snap.data()?.reportDocument, ...settings };
  await ref.update({ reportDocument, updatedAt: Date.now() });
  return jsonWithCache({ reportDocument }, "noStore");
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { buildProjection } from "@/lib/jobs/projection";
import { isCommsConfigured, sendEmail } from "@/lib/comms/send";
import type { FieldUpdate } from "@/types/jobs";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// POST /api/jobs/[jobId]/report/send  body: { businessId, to, reportNotes?, photos?: [{label, fullB64}] }
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!isCommsConfigured()) return NextResponse.json({ error: "Email not configured" }, { status: 503 });

  const body = await req.json();
  const { businessId, to, reportNotes, photos } = body as {
    businessId?: string; to?: string; reportNotes?: string;
    photos?: Array<{ label: string; fullB64: string }>;
  };
  if (!businessId || !to) return NextResponse.json({ error: "businessId and to required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Firestore not available" }, { status: 503 });

  const [jobSnap, bizSnap, updatesSnap] = await Promise.all([
    db.collection(`businesses/${businessId}/jobs`).doc(jobId).get(),
    db.collection("businesses").doc(businessId).get(),
    db.collection(`businesses/${businessId}/jobs/${jobId}/updates`).orderBy("createdAt", "asc").get(),
  ]);
  if (!jobSnap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const job = jobSnap.data()!;
  const biz = bizSnap.exists ? bizSnap.data()! : {};
  const accent: string = biz.brandColor ?? "#1e3a5f";
  const bizName: string = biz.businessName ?? "Field Report";
  const logoUrl: string | null = biz.logoUrl ?? null;

  const projection = job.parsed ?? buildProjection(updatesSnap.docs.map((d) => ({ updateId: d.id, ...d.data() })) as FieldUpdate[]);
  const issues = projection.issues ?? [];
  const materials = projection.materials ?? [];
  const labor = projection.labor ?? [];
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const sevColor: Record<string, string> = { high: "#b91c1c", medium: "#92400e", low: "#15803d" };

  const issuesHtml = issues.length
    ? `<div style="margin:0 0 24px"><div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#475569;margin-bottom:8px">Issues Identified</div>${issues
        .map((i: { description: string; severity: string }) => `<div style="padding:10px 14px;border-left:4px solid ${sevColor[i.severity] ?? "#94a3b8"};background:#f8fafc;border-radius:6px;margin-bottom:6px;font-size:14px"><strong style="text-transform:uppercase;font-size:10px;color:${sevColor[i.severity] ?? "#475569"}">${esc(i.severity)}</strong> &nbsp;${esc(i.description)}</div>`)
        .join("")}</div>`
    : "";

  const notesHtml = reportNotes?.trim()
    ? `<div style="margin:0 0 24px"><div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#475569;margin-bottom:8px">Scope &amp; Resolution</div><p style="margin:0;font-size:14px;color:#334155;line-height:1.7;white-space:pre-wrap">${esc(reportNotes.trim())}</p></div>`
    : "";

  const photosHtml = photos?.length
    ? `<div style="margin:0 0 8px"><div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#475569;margin-bottom:8px">Photo Documentation</div><table style="width:100%;border-collapse:collapse"><tr>${photos
        .slice(0, 8)
        .map((p, i) => `<td style="width:50%;padding:6px;vertical-align:top"><img src="data:image/jpeg;base64,${p.fullB64}" style="width:100%;border-radius:8px;border:1px solid #e2e8f0"/><div style="font-size:12px;color:#475569;margin-top:4px">${esc(p.label)}</div></td>${i % 2 === 1 ? "</tr><tr>" : ""}`)
        .join("")}</tr></table></div>`
    : "";

  const summaryBits: string[] = [];
  if (issues.length) summaryBits.push(`${issues.length} issue${issues.length > 1 ? "s" : ""} identified`);
  if (materials.length) summaryBits.push(`${materials.length} material${materials.length > 1 ? "s" : ""} used`);
  const totalHours = labor.reduce((s: number, l: { hours?: number }) => s + (l.hours ?? 0), 0);
  if (totalHours > 0) summaryBits.push(`${totalHours.toFixed(1)} labor hours`);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:680px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
  <div style="background:${accent};padding:28px 40px;display:flex;align-items:center;gap:14px">
    ${logoUrl ? `<img src="${logoUrl}" style="height:40px;filter:brightness(0) invert(1)"/>` : ""}
    <div>
      <div style="color:rgba(255,255,255,0.7);font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase">Job Report</div>
      <div style="color:#fff;font-size:20px;font-weight:800">${esc(bizName)}</div>
    </div>
  </div>
  <div style="padding:32px 40px">
    <div style="margin-bottom:24px">
      <div style="font-size:18px;font-weight:800;color:#0f172a">${esc(job.title ?? jobId)}</div>
      <div style="font-size:13px;color:#64748b;margin-top:4px">
        ${job.clientName ? `${esc(job.clientName)} &middot; ` : ""}${job.address ? `${esc(job.address)} &middot; ` : ""}${today}
      </div>
    </div>
    ${summaryBits.length ? `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:14px;color:#0c4a6e">${summaryBits.join(" &middot; ")}.</div>` : ""}
    ${notesHtml}
    ${issuesHtml}
    ${photosHtml}
    <div style="margin-top:24px;font-size:11px;color:#94a3b8;text-align:center">Powered by Luxor AI</div>
  </div>
</div>
</body></html>`;

  await sendEmail({ to, subject: `Job Report \u2014 ${job.title ?? jobId} from ${bizName}`, html });
  return NextResponse.json({ ok: true });
}

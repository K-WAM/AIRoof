import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import type { FieldUpdate, ParsedUpdate } from "@/types/jobs";

function renderSection(title: string, lines: string[]): string {
  if (lines.length === 0) return "";
  return `\n## ${title}\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

// POST /api/jobs/[jobId]/report — generate plain-text report from all parsed updates
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await req.json();
  const { businessId } = body;

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const [jobSnap, updatesSnap] = await Promise.all([
    db.collection(`businesses/${businessId}/jobs`).doc(jobId).get(),
    db.collection(`businesses/${businessId}/jobs/${jobId}/updates`).orderBy("createdAt", "asc").get(),
  ]);

  if (!jobSnap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const job = jobSnap.data()!;
  const updates = updatesSnap.docs.map((d) => d.data() as FieldUpdate);

  const allParsed = updates.map((u) => u.parsed).filter(Boolean) as ParsedUpdate[];

  const timeline = allParsed.flatMap((p) => p.timeline.map((t) => t.time ? `[${t.time}] ${t.description}` : t.description));
  const materials = allParsed.flatMap((p) => p.materials.map((m) => {
    let s = m.item;
    if (m.quantity) s += ` — ${m.quantity}${m.unit ? " " + m.unit : ""}`;
    if (m.cost != null) s += ` ($${m.cost})`;
    return s;
  }));
  const labor = allParsed.flatMap((p) => p.labor.map((l) => {
    let s = l.description;
    if (l.hours != null) s += ` — ${l.hours}h`;
    if (l.rate != null) s += ` @ $${l.rate}/h`;
    return s;
  }));
  const issues = allParsed.flatMap((p) => p.issues.map((i) => `[${i.severity.toUpperCase()}] ${i.description}`));

  const createdDate = new Date(job.createdAt as number).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  let report = `# Job Report — ${job.title ?? jobId}\n`;
  report += `**Job ID:** ${jobId}  \n`;
  if (job.clientName) report += `**Client:** ${job.clientName}  \n`;
  if (job.address) report += `**Address:** ${job.address}  \n`;
  if (job.serviceType) report += `**Service:** ${job.serviceType}  \n`;
  report += `**Date:** ${createdDate}  \n`;
  report += `**Status:** ${job.status ?? "open"}  \n`;
  report += renderSection("Timeline", timeline);
  report += renderSection("Materials Used", materials);
  report += renderSection("Labor", labor);
  report += renderSection("Issues Found", issues);

  if (updates.length > 0) {
    report += "\n\n## Field Notes (raw)\n";
    updates.forEach((u, i) => {
      const ts = new Date(u.createdAt).toLocaleString("en-US");
      report += `\n### Update ${i + 1} — ${ts}\n${u.rawText}\n`;
    });
  }

  return NextResponse.json({ report });
}

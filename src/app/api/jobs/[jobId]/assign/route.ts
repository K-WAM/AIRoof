import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { sendCrewAssignment } from "@/lib/notify";
import type { Crew } from "@/types/library";

// POST /api/jobs/[jobId]/assign  body: { businessId, crewId, scheduledStart, scheduledEnd? }
// Marks the job confirmed for the crew and emails them a branded assignment notice.
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await req.json();
  const { businessId, crewId, scheduledStart, scheduledEnd } = body;
  if (!businessId || !crewId) return NextResponse.json({ error: "businessId and crewId required" }, { status: 400 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const [jobSnap, crewSnap, bizSnap] = await Promise.all([
    db.collection(`businesses/${businessId}/jobs`).doc(jobId).get(),
    db.collection(`businesses/${businessId}/crews`).doc(crewId).get(),
    db.collection("businesses").doc(businessId).get(),
  ]);
  if (!jobSnap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!crewSnap.exists) return NextResponse.json({ error: "Crew not found" }, { status: 404 });

  const job = jobSnap.data()!;
  const crew = crewSnap.data() as Crew;
  const biz = bizSnap.exists ? bizSnap.data()! : {};
  const tz: string = biz.timezone ?? "America/New_York";

  await db.collection(`businesses/${businessId}/jobs`).doc(jobId).update({
    assignedCrewId: crewId,
    crewConfirmed: true,
    ...(scheduledStart ? { scheduledStart } : {}),
    ...(scheduledEnd ? { scheduledEnd } : {}),
    updatedAt: Date.now(),
  });

  let emailed = false;
  if (crew.email) {
    const when = scheduledStart
      ? new Date(scheduledStart).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz })
      : "TBD";
    emailed = await sendCrewAssignment({
      to: crew.email,
      brand: {
        businessName: biz.businessName ?? "Your Company",
        brandColor: biz.brandColor,
        logoUrl: biz.logoUrl,
        contactPhone: biz.contactPhone,
        contactEmail: biz.contactEmail,
      },
      crewName: crew.name,
      jobTitle: job.title ?? jobId,
      address: job.address,
      clientName: job.clientName,
      when,
      scope: job.serviceType,
    });
  }

  return NextResponse.json({ ok: true, emailed });
}

import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { sendEmail } from "@/lib/comms/send";
import { sendSms } from "@/lib/comms/sms";
import { resolveLetterhead } from "@/lib/documents/letterhead";
import { buildFieldLinkEmail, fieldLinkMessage } from "@/lib/notify";
import type { LibraryLogo } from "@/types/library";
import {
  FIELD_JOB_LINK_MAX_AGE_MS,
  fieldKeyFingerprint,
  verifyAuthAndRole,
  type StoredFieldJobLink,
} from "@/lib/auth/verifyRole";

// POST   /api/jobs/[jobId]/field-qr — the job's ONE reusable field link (created on first use, then the same link
//        every time), for staff to text or email to any worker or contractor. No account: they open it, type their
//        name and log work. See openFieldJobLink() in verifyRole.ts for when it stops working.
// DELETE /api/jobs/[jobId]/field-qr — "Stop link": the old link stops at once; the next POST makes a new one.
//        With `sendTo` (a phone number or an email) the same call also delivers it: email from the app; a text from
//        the business's texting line when that is switched on, otherwise `sent: "use_phone"` + the message so the
//        office person's own phone sends it (sms: link) — the worker sees a number they know.
// The route keeps its old name (field-qr) because the QR code is one way to hand the same link over.

type Gate = { error: NextResponse } | { db: FirebaseFirestore.Firestore; businessRef: FirebaseFirestore.DocumentReference };

async function gateFor(req: NextRequest, jobId: string, businessId: string | undefined): Promise<Gate> {
  if (!businessId) return { error: NextResponse.json({ error: "businessId required" }, { status: 400 }) };
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return { error: gate.error };
  const db = getAdminFirestore();
  if (!db) return { error: NextResponse.json({ error: "Database unavailable" }, { status: 503 }) };
  const businessRef = db.collection("businesses").doc(businessId);
  const jobSnap = await businessRef.collection("jobs").doc(jobId).get();
  if (!jobSnap.exists) return { error: NextResponse.json({ error: "Job not found" }, { status: 404 }) };
  return { db, businessRef };
}

// Which link is current for a job lives OUTSIDE the job doc on purpose: the job doc is readable by View-only users,
// and the link is a credential (anyone holding it can add notes to the job).
function linkIndexRef(db: FirebaseFirestore.Firestore, businessId: string, jobId: string) {
  return db.collection("fieldJobLinkIndex").doc(`${businessId}__${jobId}`);
}

async function currentLinkId(ref: FirebaseFirestore.DocumentReference): Promise<string | null> {
  const snap = await ref.get();
  const id = snap.exists ? snap.data()?.linkId : null;
  return typeof id === "string" && id ? id : null;
}

async function readBody(req: NextRequest): Promise<{ businessId?: string; sendTo?: string } | null> {
  try { return await req.json(); } catch { return null; }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const gate = await gateFor(req, jobId, body.businessId);
  if ("error" in gate) return gate.error;
  const { db, businessRef } = gate;
  const businessId = body.businessId!;
  const indexRef = linkIndexRef(db, businessId, jobId);

  const businessSnap = await businessRef.get();
  if (!businessSnap.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  // Lazily provision the business's field key. Rotating it later revokes every link and session at once.
  let fieldKey = businessSnap.data()?.fieldKey;
  if (typeof fieldKey !== "string" || fieldKey.length < 16) {
    fieldKey = randomBytes(16).toString("hex");
    await businessRef.set({ fieldKey }, { merge: true });
  }
  let tag: string;
  try {
    tag = fieldKeyFingerprint(fieldKey);
  } catch {
    return NextResponse.json({ error: "Field access is not configured" }, { status: 503 });
  }

  const business = businessSnap.data() ?? {};
  async function finish(fieldUrl: string, expiresAt: number) {
    const base = { ok: true, fieldUrl, expiresAt, reusable: true };
    if (!body!.sendTo) return NextResponse.json(base);
    const sent = await deliverFieldLink({ db, businessId, jobId, business, fieldUrl, to: body!.sendTo });
    return NextResponse.json({ ...base, ...sent }, { status: sent.sent === "invalid" ? 400 : 200 });
  }

  // Same link every time while it is still good — a worker's old text keeps working.
  const existingId = await currentLinkId(indexRef);
  if (existingId) {
    const snap = await db.collection("fieldJobLinks").doc(existingId).get();
    const link = snap.data() as Partial<StoredFieldJobLink> | undefined;
    if (snap.exists && link && !link.revokedAt && link.fieldKeyTag === tag && link.businessId === businessId && link.jobId === jobId
      && typeof link.createdAt === "number" && Date.now() - link.createdAt < FIELD_JOB_LINK_MAX_AGE_MS) {
      return finish(`${req.nextUrl.origin}/f/${existingId}`, link.createdAt + FIELD_JOB_LINK_MAX_AGE_MS);
    }
  }

  const linkId = randomBytes(16).toString("base64url");
  const createdAt = Date.now();
  const link: StoredFieldJobLink = { businessId, jobId, fieldKeyTag: tag, createdAt, revokedAt: null };
  await db.collection("fieldJobLinks").doc(linkId).set(link);
  await indexRef.set({ linkId, businessId, jobId, updatedAt: createdAt });
  return finish(`${req.nextUrl.origin}/f/${linkId}`, createdAt + FIELD_JOB_LINK_MAX_AGE_MS);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const gate = await gateFor(req, jobId, body.businessId);
  if ("error" in gate) return gate.error;
  const { db } = gate;
  const indexRef = linkIndexRef(db, body.businessId!, jobId);
  const existingId = await currentLinkId(indexRef);
  if (existingId) await db.collection("fieldJobLinks").doc(existingId).set({ revokedAt: Date.now() }, { merge: true });
  await indexRef.delete().catch(() => {});
  return NextResponse.json({ ok: true, stopped: !!existingId });
}

type Delivery = { sent: "email" | "sms" | "use_phone" | "invalid" | "failed"; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function deliverFieldLink(opts: {
  db: FirebaseFirestore.Firestore;
  businessId: string;
  jobId: string;
  business: Record<string, unknown>;
  fieldUrl: string;
  to: string;
}): Promise<Delivery> {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const jobSnap = await opts.db.collection("businesses").doc(opts.businessId).collection("jobs").doc(opts.jobId).get();
  const job = jobSnap.data() ?? {};
  const businessName = str(opts.business.businessName) ?? "Your company";
  const jobTitle = str(job.title) ?? opts.jobId;
  const address = str(job.address) ?? null;
  const message = fieldLinkMessage({ businessName, jobTitle, address, url: opts.fieldUrl });
  const to = opts.to.trim();

  if (to.includes("@")) {
    if (!EMAIL_RE.test(to)) return { sent: "invalid", message };
    const logosSnap = await opts.db.collection(`businesses/${opts.businessId}/library`).doc("logos").get();
    const letterhead = resolveLetterhead(opts.business, (logosSnap.data()?.logos as LibraryLogo[] | undefined) ?? [], "brand-bar");
    const { subject, html } = buildFieldLinkEmail({
      brand: {
        businessName,
        brandColor: str(opts.business.brandColor),
        logoUrl: letterhead.logoUrl,
        logoFilter: letterhead.logoStyle.filter as string | undefined,
        logoChip: letterhead.logoChip,
        contactPhone: str(opts.business.contactPhone),
        contactEmail: str(opts.business.contactEmail),
      },
      jobTitle,
      address,
      url: opts.fieldUrl,
    });
    const result = await sendEmail({ to, subject, html, fromName: businessName, replyTo: str(opts.business.contactEmail) ?? str(opts.business.notificationEmail) });
    return { sent: result.status === "delivered" ? "email" : "failed", message };
  }

  const digits = to.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return { sent: "invalid", message };
  const state = await sendSms({
    businessId: opts.businessId,
    to,
    body: message,
    messageType: "field_link",
    // One text per number per link per minute — a double tap never double-texts.
    entityId: `${opts.jobId}:${digits}:${Math.floor(Date.now() / 60_000)}`,
    purpose: "field_link",
  });
  return { sent: state === "delivered" || state === "pending" ? "sms" : "use_phone", message };
}

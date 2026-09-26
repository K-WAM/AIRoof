import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { FLORIDA_NOTICE_DEFAULTS } from "@/lib/documents/legalNotices";
import {
  NOTICE_TEXT_MAX,
  draftMarkerNotices,
  effectiveNotices,
  noticeApproval,
  noticeFingerprint,
  type DocumentNoticeSettings,
  type NoticeOverride,
} from "@/lib/documents/notices";

// Terms & notices (owner/superadmin ONLY — legal wording). GET: the effective wording + approval state.
// PUT { businessId, notices?, approve? }: save the business's own wording, and/or record "I have had these reviewed".
// Approval is refused while an enabled notice still carries a "[DRAFT" placeholder, and it is bound to the exact wording:
// any later edit withdraws it (documents/notices.ts), so nothing unreviewed can reach a customer.

const IDS = new Set(FLORIDA_NOTICE_DEFAULTS.map((d) => d.id));
const plain = (s: string) => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s);

function view(settings: DocumentNoticeSettings | undefined) {
  const approval = noticeApproval(settings);
  return {
    notices: effectiveNotices(settings),
    approval: {
      approved: approval.approved,
      status: approval.status,
      approvedAt: settings?.approvedAt ?? null,
      approvedBy: settings?.approvedBy ?? null,
      blockingIds: approval.blocking.map((n) => n.id),
    },
  };
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const snap = await db.collection("businesses").doc(businessId).get();
  if (!snap.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  return jsonWithCache(view(snap.data()?.documentNotices as DocumentNoticeSettings | undefined), "noStore");
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as { businessId?: string; notices?: unknown; approve?: unknown } | null;
  const businessId = body?.businessId;
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  // Validate the shape before touching auth or the database.
  let notices: Record<string, NoticeOverride> | undefined;
  if (body!.notices !== undefined) {
    if (!body!.notices || typeof body!.notices !== "object" || Array.isArray(body!.notices)) return NextResponse.json({ error: "notices must be an object" }, { status: 400 });
    notices = {};
    for (const [id, raw] of Object.entries(body!.notices as Record<string, unknown>)) {
      if (!IDS.has(id)) return NextResponse.json({ error: `Unknown notice: ${id}` }, { status: 400 });
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NextResponse.json({ error: `Invalid notice: ${id}` }, { status: 400 });
      const { enabled, text, showOn } = raw as Record<string, unknown>;
      const clean: NoticeOverride = {};
      if (enabled !== undefined) { if (typeof enabled !== "boolean") return NextResponse.json({ error: `Invalid enabled flag for ${id}` }, { status: 400 }); clean.enabled = enabled; }
      if (text !== undefined) {
        if (typeof text !== "string" || text.length > NOTICE_TEXT_MAX || !plain(text)) return NextResponse.json({ error: `Notice wording for ${id} must be plain text up to ${NOTICE_TEXT_MAX} characters` }, { status: 400 });
        if (text.trim()) clean.text = text.trim();
      }
      if (showOn !== undefined) {
        if (!Array.isArray(showOn) || showOn.some((doc) => doc !== "quote" && doc !== "invoice")) return NextResponse.json({ error: `Invalid placement for ${id}` }, { status: 400 });
        clean.showOn = showOn as NoticeOverride["showOn"];
      }
      notices[id] = clean;
    }
  }
  if (body!.approve !== undefined && body!.approve !== true) return NextResponse.json({ error: "approve must be true" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const ref = db.collection("businesses").doc(businessId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const current = (snap.data()?.documentNotices ?? {}) as DocumentNoticeSettings;

  const next: DocumentNoticeSettings = { ...current, ...(notices ? { notices } : {}) };
  if (body!.approve === true) {
    const blocking = draftMarkerNotices(effectiveNotices(next));
    if (blocking.length) {
      return NextResponse.json({
        error: `Replace the [DRAFT placeholder wording in ${blocking.map((n) => `"${n.title}"`).join(", ")} with your attorney's wording — or switch those notices off — before approving.`,
        blockingIds: blocking.map((n) => n.id),
      }, { status: 409 });
    }
    next.approvedAt = Date.now();
    next.approvedBy = gate.user.uid;
    next.approvedFingerprint = noticeFingerprint(effectiveNotices(next));
  }

  await ref.update({ documentNotices: next, updatedAt: Date.now() });
  return jsonWithCache(view(next), "noStore");
}

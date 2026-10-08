import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { sendEmail } from "@/lib/comms/send";
import { escapeHtml } from "@/lib/documents/letterhead";
import { PRODUCTS, productsOf, type ProductId } from "@/lib/products/products";

// POST /api/company/upgrade-request  body: { businessId, product }
// The locked tab's "Ask Luxor to add it" (owner, 2026-10-08: target conversion). Records who asked for what on the
// business doc (`upgradeRequests.<product>`, shown on the superadmin's Products panel) and emails Luxor. One email per
// product per business per day, so repeated taps can't flood the inbox. Any signed-in member may ask.

const LUXOR_INBOX = "connect@luxordev.com";
const DAY = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { businessId?: unknown; product?: unknown } | null;
  const businessId = typeof body?.businessId === "string" ? body.businessId : "";
  const product = PRODUCTS.find((p) => p.id === body?.product);
  if (!businessId || !product) return NextResponse.json({ error: "businessId and a product are required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const ref = db.collection("businesses").doc(businessId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const biz = snap.data() ?? {};
  if (productsOf(biz)[product.id as ProductId]) return NextResponse.json({ ok: true, alreadyIncluded: true });
  // A superadmin previewing the client is looking, not asking — never record or email that.
  if (gate.user.superadmin) return NextResponse.json({ ok: true, notified: false, preview: true });

  const now = Date.now();
  const previous = biz.upgradeRequests?.[product.id] as { at?: number } | undefined;
  const who = gate.user.email || gate.user.uid;
  await ref.update({ [`upgradeRequests.${product.id}`]: { at: now, by: who } });
  if (previous?.at && now - previous.at < DAY) return NextResponse.json({ ok: true, notified: false });

  const name = String(biz.businessName || businessId);
  const html = `<p><b>${escapeHtml(name)}</b> (${escapeHtml(businessId)}) asked to add <b>${escapeHtml(product.label)}</b>.</p>
<p>Asked by: ${escapeHtml(who)}<br/>Owner contact: ${escapeHtml(String(biz.contactEmail || biz.notificationEmail || "—"))} · ${escapeHtml(String(biz.contactPhone || "—"))}</p>
<p>Turn it on: Admin → Clients → ${escapeHtml(name)} → Products.</p>`;
  const sent = await sendEmail({ to: LUXOR_INBOX, subject: `[Upgrade request] ${name} wants ${product.label}`, html, replyTo: gate.user.email || null });
  return NextResponse.json({ ok: true, notified: sent.status === "delivered" });
}

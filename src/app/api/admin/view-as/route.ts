import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { confirmSuperadminClaim, getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { isPlatformAccount } from "@/lib/auth/platformAccount";
import { evictViewAs, viewAsCookieOptions, viewAsId, VIEW_AS_COOKIE, VIEW_AS_TTL_MS, type ViewAsSession } from "@/lib/auth/viewAs";
import { VIEW_AS_TYPES } from "@/lib/auth/viewAsTypes";
import { userTypeDef, userTypeOf } from "@/lib/team/userTypes";
import { defaultLandingPath } from "@/lib/team/landing";
import { productsOf } from "@/lib/products/products";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import { jsonWithCache } from "@/lib/http/cache";
import type { TeamRole, TradeTitle } from "@/types/team";
import type { CompanyModule } from "@/hooks/useBusinessModules";

const validId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 128 && !id.includes("/");
const tenantRoles = ["owner", "staff", "crew", "viewer"];

function disabledModules(business: { industry?: string; products?: Record<string, unknown> }): CompanyModule[] {
  const disabled = new Set<CompanyModule>((getVerticalTemplate(business.industry ?? "roofing").disabledModules ?? []) as CompanyModule[]);
  const products = productsOf(business);
  if (!products.field) disabled.add("jobs");
  if (!products.calls) disabled.add("calls");
  if (!products.billing || disabled.has("jobs")) disabled.add("billing");
  return [...disabled];
}

/** Lazy menu data: active tenant members, names and type labels only, never platform accounts or emails. */
export async function GET(req: NextRequest) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!validId(businessId)) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const db = getAdminFirestore();
  const auth = getAdminAuth();
  if (!db || !auth) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  const business = await db.collection("businesses").doc(businessId).get();
  if (!business.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const disabled = disabledModules(business.data()!);
  const types = VIEW_AS_TYPES.filter((type) => !type.field || !disabled.includes("jobs")).map(({ id, label }) => ({ id, label }));
  const rows = await db.collection("businessUsers").where("businessId", "==", businessId).get();
  const members = (await Promise.all(rows.docs.map(async (doc) => {
    const member = doc.data();
    if (member.active === false || !tenantRoles.includes(member.role) || doc.id === gate.user.uid ||
        (member.role === "crew" && disabled.includes("jobs")) ||
        (member.isDemoTrial === true && !(Number(member.demoTrialExpiresAt) > Date.now()))) return null;
    try {
      const record = await auth.getUser(doc.id);
      if (record.disabled || await isPlatformAccount({ getUser: async () => record }, doc.id, member)) return null;
    } catch { return null; }
    const type = userTypeOf({ role: member.role as string | undefined, trade: typeof member.trade === "string" ? member.trade : undefined });
    return { uid: doc.id, label: `${member.displayName || "Team member"} — ${userTypeDef(type).label}` };
  }))).filter((member) => member !== null);
  return jsonWithCache({ types, members }, "noStore");
}

export async function POST(req: NextRequest) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;
  const decoded = await verifyIdToken(req.cookies.get("__session")!.value);
  if (!decoded || !(await confirmSuperadminClaim(decoded))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || !validId(body.businessId) || (!!body.userType === !!body.memberUid) ||
      (body.memberUid !== undefined && !validId(body.memberUid))) {
    return NextResponse.json({ error: "Choose a business and one user type or member." }, { status: 400 });
  }
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const business = await db.collection("businesses").doc(body.businessId).get();
  if (!business.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const disabled = disabledModules(business.data()!);
  let role: TeamRole;
  let trade: string | undefined;
  let crewId: string | undefined;
  let label: string;
  if (body.memberUid) {
    const snap = await db.collection("businessUsers").doc(body.memberUid).get();
    const member = snap.data();
    if (!member || member.businessId !== body.businessId || member.active === false ||
        !tenantRoles.includes(member.role) || body.memberUid === gate.user.uid ||
        (member.isDemoTrial === true && !(Number(member.demoTrialExpiresAt) > Date.now()))) {
      return NextResponse.json({ error: "Not an active member of this business." }, { status: 403 });
    }
    const auth = getAdminAuth();
    if (!auth) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    try {
      const record = await auth.getUser(body.memberUid);
      if (record.disabled || await isPlatformAccount({ getUser: async () => record }, body.memberUid, member)) {
        return NextResponse.json({ error: "Platform or disabled accounts cannot be viewed." }, { status: 403 });
      }
    } catch { return NextResponse.json({ error: "Member could not be verified." }, { status: 403 }); }
    role = member.role;
    trade = typeof member.trade === "string" ? member.trade : undefined;
    crewId = typeof member.crewId === "string" ? member.crewId : undefined;
    const type = userTypeOf({ role: member.role as string | undefined, trade });
    label = `${member.displayName || "Team member"} — ${userTypeDef(type).label}`;
  } else {
    const type = VIEW_AS_TYPES.find((type) => type.id === body.userType);
    if (!type) return NextResponse.json({ error: "Unknown user type." }, { status: 400 });
    role = type.role;
    trade = type.trade;
    label = type.label;
  }
  if (role === "crew" && disabled.includes("jobs")) return NextResponse.json({ error: "This business has no field work." }, { status: 403 });
  const now = Date.now();
  const id = randomBytes(32).toString("base64url");
  const session: ViewAsSession = { uid: gate.user.uid, businessId: body.businessId, role, label,
    ...(trade ? { trade } : {}), ...(crewId ? { crewId } : {}), ...(body.memberUid ? { memberUid: body.memberUid } : {}),
    createdAt: now, expiresAt: now + VIEW_AS_TTL_MS, endedAt: null };
  const ref = db.collection("viewAsSessions").doc(id);
  // The session and its audit are atomic. Never return the bearer id in JSON or the audit record.
  const auditRef = db.collection("adminAuditEvents").doc(`audit_${randomUUID()}`);
  await db.runTransaction(async (tx) => {
    tx.set(ref, session);
    tx.set(auditRef, { auditEventId: auditRef.id, actorUid: gate.user.uid, actorEmail: gate.user.email ?? null,
      businessId: session.businessId, action: "view_as.started", targetPath: "viewAsSessions", before: null,
      after: { role, label, memberUid: session.memberUid ?? null, expiresAt: session.expiresAt }, createdAt: now });
  });
  const response = jsonWithCache({ landingPath: defaultLandingPath({ role, trade: trade as TradeTitle | undefined }, disabled) }, "noStore");
  response.cookies.set(VIEW_AS_COOKIE, id, viewAsCookieOptions());
  return response;
}

export async function DELETE(req: NextRequest) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;
  const id = viewAsId(req);
  if (id) {
    const db = getAdminFirestore();
    if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    const ref = db.collection("viewAsSessions").doc(id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const session = snap.data();
      if (session?.uid === gate.user.uid && session.endedAt === null) {
        const now = Date.now();
        tx.update(ref, { endedAt: now });
        const auditRef = db.collection("adminAuditEvents").doc(`audit_${randomUUID()}`);
        tx.set(auditRef, { auditEventId: auditRef.id, actorUid: gate.user.uid, actorEmail: gate.user.email ?? null,
          businessId: session.businessId, action: "view_as.ended", targetPath: "viewAsSessions", before: null, after: null, createdAt: now });
      }
    });
    evictViewAs(id);
  }
  const response = jsonWithCache({ success: true }, "noStore");
  response.cookies.set(VIEW_AS_COOKIE, "", { ...viewAsCookieOptions(), maxAge: 0 });
  return response;
}

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/config/env";
import { verifyIdToken, getAdminFirestore } from "@/lib/firebase/admin";

export type AllowedRole = "owner" | "staff" | "viewer" | "superadmin";

export interface VerifiedUser {
  uid: string;
  email?: string;
  superadmin: boolean;
  role?: AllowedRole;
  businessId?: string;
}

export const FIELD_ACCESS_COOKIE = "__field_access";
export const FIELD_EXCHANGE_TTL_MS = 10 * 60 * 1000;
export const FIELD_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const FIELD_TOKEN_VERSION = 1;
const FIELD_TOKEN_CLOCK_SKEW_MS = 60_000;
const FIELD_TOKEN_SECRET_CONTEXT = "luxor-field-access-v1";

type FieldTokenKind = "exchange" | "session";

interface FieldTokenClaims {
  version: typeof FIELD_TOKEN_VERSION;
  kind: FieldTokenKind;
  businessId: string;
  jobId?: string;
  fieldKeyTag: string;
  issuedAt: number;
  expiresAt: number;
  tokenId: string;
}

type FieldTokenFailure = {
  ok: false;
  status: 401 | 403 | 503;
  error: string;
};

type FieldTokenSuccess = {
  ok: true;
  token: string;
  businessId: string;
  jobId?: string;
  expiresAt: number;
};

export type FieldTokenExchangeResult = FieldTokenFailure | FieldTokenSuccess;

function fieldTokenSecret(): Buffer | null {
  // T-020 established CRON_SECRET as a required server-only secret. Derive a
  // purpose-specific HMAC key so field tokens never use the cron credential
  // itself as signing material.
  const serverSecret = getEnv("CRON_SECRET")?.trim();
  if (!serverSecret) return null;
  return createHmac("sha256", serverSecret)
    .update(FIELD_TOKEN_SECRET_CONTEXT)
    .digest();
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function fieldKeyTag(fieldKey: string, secret: Buffer): string {
  return createHmac("sha256", secret)
    .update("field-key:")
    .update(fieldKey)
    .digest("base64url");
}

function signFieldToken(claims: FieldTokenClaims, secret: Buffer): string {
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedClaims).digest("base64url");
  return `${encodedClaims}.${signature}`;
}

function parseFieldToken(
  token: string,
  expectedKind: FieldTokenKind,
  now: number,
): { ok: true; claims: FieldTokenClaims; secret: Buffer } | FieldTokenFailure {
  const secret = fieldTokenSecret();
  if (!secret) {
    return { ok: false, status: 503, error: "Field access is not configured" };
  }

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, status: 401, error: "Invalid field access token" };
  }

  const expectedSignature = createHmac("sha256", secret).update(parts[0]).digest("base64url");
  if (!safeEqual(parts[1], expectedSignature)) {
    return { ok: false, status: 401, error: "Invalid field access token" };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return { ok: false, status: 401, error: "Invalid field access token" };
  }
  if (!decoded || typeof decoded !== "object") {
    return { ok: false, status: 401, error: "Invalid field access token" };
  }
  const claims = decoded as FieldTokenClaims;

  const maxTtl = expectedKind === "exchange" ? FIELD_EXCHANGE_TTL_MS : FIELD_SESSION_TTL_MS;
  const validShape =
    claims.version === FIELD_TOKEN_VERSION &&
    claims.kind === expectedKind &&
    typeof claims.businessId === "string" &&
    claims.businessId.length > 0 &&
    (claims.jobId === undefined || (typeof claims.jobId === "string" && claims.jobId.length > 0)) &&
    typeof claims.fieldKeyTag === "string" &&
    typeof claims.issuedAt === "number" &&
    typeof claims.expiresAt === "number" &&
    typeof claims.tokenId === "string" &&
    claims.tokenId.length > 0 &&
    claims.expiresAt > claims.issuedAt &&
    claims.expiresAt - claims.issuedAt <= maxTtl &&
    claims.issuedAt <= now + FIELD_TOKEN_CLOCK_SKEW_MS;

  if (!validShape) {
    return { ok: false, status: 401, error: "Invalid field access token" };
  }
  if (claims.expiresAt <= now) {
    return { ok: false, status: 401, error: "Field access token expired" };
  }

  return { ok: true, claims, secret };
}

function mintToken(
  kind: FieldTokenKind,
  businessId: string,
  fieldKey: string,
  jobId: string | undefined,
  ttlMs: number,
  now = Date.now(),
): FieldTokenSuccess {
  const secret = fieldTokenSecret();
  if (!secret) throw new Error("Field access is not configured");
  if (!businessId || fieldKey.length < 16) throw new Error("Invalid field token mint request");

  const claims: FieldTokenClaims = {
    version: FIELD_TOKEN_VERSION,
    kind,
    businessId,
    ...(jobId ? { jobId } : {}),
    fieldKeyTag: fieldKeyTag(fieldKey, secret),
    issuedAt: now,
    expiresAt: now + ttlMs,
    tokenId: randomUUID(),
  };
  return {
    ok: true,
    token: signFieldToken(claims, secret),
    businessId,
    ...(jobId ? { jobId } : {}),
    expiresAt: claims.expiresAt,
  };
}

/** Mint a one-use, ten-minute grant for a QR/exchange URL. */
export function mintFieldExchangeToken(
  businessId: string,
  fieldKey: string,
  jobId?: string,
): FieldTokenSuccess {
  return mintToken("exchange", businessId, fieldKey, jobId, FIELD_EXCHANGE_TTL_MS);
}

function legacyFieldKeyFallbackEnabled(): boolean {
  // Temporary one-deploy compatibility gate. T-051 removes this entire path.
  return getEnv("ENABLE_LEGACY_FIELD_KEY_FALLBACK")?.trim().toLowerCase() !== "false";
}

async function loadCurrentFieldKey(
  businessId: string,
): Promise<{ ok: true; db: FirebaseFirestore.Firestore; fieldKey: string } | FieldTokenFailure> {
  const db = getAdminFirestore();
  if (!db) return { ok: false, status: 503, error: "Database unavailable" };
  const snap = await db.collection("businesses").doc(businessId).get();
  const current = snap.data()?.fieldKey;
  if (typeof current !== "string" || current.length < 16) {
    return { ok: false, status: 401, error: "Field access revoked" };
  }
  return { ok: true, db, fieldKey: current };
}

async function validateCurrentFieldKey(
  claims: FieldTokenClaims,
  secret: Buffer,
): Promise<{ ok: true; db: FirebaseFirestore.Firestore; fieldKey: string } | FieldTokenFailure> {
  const current = await loadCurrentFieldKey(claims.businessId);
  if (!current.ok) return current;
  if (!safeEqual(claims.fieldKeyTag, fieldKeyTag(current.fieldKey, secret))) {
    return { ok: false, status: 401, error: "Field access revoked" };
  }
  return current;
}

type FieldAccessAuditEvent = {
  action: "exchange" | "legacy_exchange" | "access" | "legacy_access";
  businessId: string;
  tokenId: string;
  jobId?: string;
  request?: NextRequest;
};

type StoredFieldAccessAudit = {
  businessId: string;
  action: FieldAccessAuditEvent["action"];
  actor: string;
  tokenId: string;
  jobId: string | null;
  path: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
};

function fieldAccessAuditDocument(event: FieldAccessAuditEvent): StoredFieldAccessAudit {
  const now = Date.now();
  return {
    businessId: event.businessId,
    action: event.action,
    actor: `field:${event.businessId}`,
    tokenId: event.tokenId,
    jobId: event.jobId ?? null,
    path: event.request?.nextUrl.pathname ?? null,
    ip: event.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: event.request?.headers.get("user-agent") ?? null,
    createdAt: now,
  };
}

async function recordFieldAccessAudit(
  db: FirebaseFirestore.Firestore,
  event: FieldAccessAuditEvent,
): Promise<void> {
  const now = Date.now();
  await db.collection("fieldAccessAuditEvents").doc(`field_${now}_${randomUUID()}`).set(
    fieldAccessAuditDocument(event),
  );
}

/** Consume a signed QR grant exactly once and issue a longer-lived field session. */
export async function consumeFieldExchangeToken(
  grant: string,
  request?: NextRequest,
): Promise<FieldTokenExchangeResult> {
  const parsed = parseFieldToken(grant, "exchange", Date.now());
  if (!parsed.ok) return parsed;

  const current = await validateCurrentFieldKey(parsed.claims, parsed.secret);
  if (!current.ok) return current;

  const useRef = current.db.collection("fieldAccessGrantUses").doc(parsed.claims.tokenId);
  const auditRef = current.db.collection("fieldAccessAuditEvents").doc(
    `field_${Date.now()}_${randomUUID()}`,
  );
  const consumed = await current.db.runTransaction(async (transaction) => {
    const used = await transaction.get(useRef);
    if (used.exists) return false;
    transaction.set(useRef, {
      businessId: parsed.claims.businessId,
      jobId: parsed.claims.jobId ?? null,
      consumedAt: Date.now(),
      expiresAt: parsed.claims.expiresAt,
    });
    transaction.set(auditRef, fieldAccessAuditDocument({
      action: "exchange",
      businessId: parsed.claims.businessId,
      tokenId: parsed.claims.tokenId,
      jobId: parsed.claims.jobId,
      request,
    }));
    return true;
  });
  if (!consumed) {
    return { ok: false, status: 401, error: "Field exchange link already used" };
  }

  return mintToken(
    "session",
    parsed.claims.businessId,
    current.fieldKey,
    parsed.claims.jobId,
    FIELD_SESSION_TTL_MS,
  );
}

/** Temporary migration exchange for an old QR/localStorage field key. */
export async function exchangeLegacyFieldKey(
  businessId: string,
  suppliedKey: string,
  jobId?: string,
  request?: NextRequest,
): Promise<FieldTokenExchangeResult> {
  if (!legacyFieldKeyFallbackEnabled()) {
    return { ok: false, status: 401, error: "Legacy field access is disabled" };
  }
  const current = await loadCurrentFieldKey(businessId);
  if (!current.ok) return current;
  if (!safeEqual(current.fieldKey, suppliedKey)) {
    return { ok: false, status: 401, error: "Invalid field access key" };
  }

  const session = mintToken("session", businessId, current.fieldKey, jobId, FIELD_SESSION_TTL_MS);
  await recordFieldAccessAudit(current.db, {
    action: "legacy_exchange",
    businessId,
    tokenId: "legacy-migration",
    jobId,
    request,
  });
  return session;
}

function requestJobId(req: NextRequest): string | undefined {
  const match = req.nextUrl.pathname.match(/^\/api\/jobs\/([^/]+)(?:\/|$)/);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

function fieldUser(businessId: string, tokenId: string): VerifiedUser {
  return {
    uid: `field:${businessId}:${tokenId}`,
    superadmin: false,
    role: "viewer",
    businessId,
  };
}

/**
 * Verifies the __session cookie and checks that the caller has one of the
 * allowed roles for the given businessId. Superadmins always pass.
 *
 * Returns { user } on success, or a NextResponse error (403/401) that callers
 * should return immediately.
 */
export async function verifyAuthAndRole(
  req: NextRequest,
  businessId: string,
  allowedRoles: AllowedRole[]
): Promise<{ user: VerifiedUser } | { error: NextResponse<{ error: string }> }> {
  const sessionCookie = req.cookies.get("__session")?.value;
  if (!sessionCookie) {
    return { error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
  }

  const decoded = await verifyIdToken(sessionCookie);
  if (!decoded) {
    return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) };
  }

  // Superadmins bypass role checks
  if (decoded.superadmin === true) {
    return { user: { uid: decoded.uid, email: decoded.email, superadmin: true } };
  }

  // Look up business membership
  const db = getAdminFirestore();
  if (!db) {
    return { error: NextResponse.json({ error: "Database unavailable" }, { status: 503 }) };
  }

  const memberSnap = await db
    .collection("businessUsers")
    .where("uid", "==", decoded.uid)
    .where("businessId", "==", businessId)
    .where("active", "==", true)
    .limit(1)
    .get();

  if (memberSnap.empty) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const member = memberSnap.docs[0].data() as { role: AllowedRole; businessId: string };

  if (!allowedRoles.includes(member.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    user: {
      uid: decoded.uid,
      email: decoded.email,
      superadmin: false,
      role: member.role,
      businessId: member.businessId,
    },
  };
}

/**
 * Guard for superadmin-only routes (e.g. all of /api/admin/*). Pass the
 * NextRequest; returns { user } if the caller is a superadmin, otherwise a
 * 401/403 NextResponse the caller should return immediately.
 *
 * Auth is cookie-based (__session holds the Firebase ID token, set by
 * AuthContext), so same-origin fetches from the admin UI are authorized
 * automatically — no Authorization header needed.
 */
export async function verifySuperadmin(
  req: NextRequest
): Promise<{ user: VerifiedUser } | { error: NextResponse<{ error: string }> }> {
  return verifyAuthAndRole(req, "", ["superadmin"]);
}

/**
 * Guard for the field data plane (jobs list, voice updates, photos). Three ways in:
 *   1. A logged-in session with any role on the business (or superadmin).
 *   2. A signed HttpOnly field-session cookie issued by the QR exchange route.
 *   3. Temporarily, a legacy field key while the one-deploy migration flag is on.
 *
 * Signed sessions are bound to the current business fieldKey digest, so rotating
 * fieldKey revokes every outstanding grant/session. Job-scoped sessions may only
 * call API paths for that job and cannot list the rest of the business's jobs.
 */
export async function verifyFieldAccess(
  req: NextRequest,
  businessId: string
): Promise<{ user: VerifiedUser } | { error: NextResponse<{ error: string }> }> {
  if (!businessId) {
    return { error: NextResponse.json({ error: "businessId required" }, { status: 400 }) };
  }

  // Path 1: session (staff/owner/viewer of this business, or superadmin)
  if (req.cookies.get("__session")?.value) {
    const byRole = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
    if ("user" in byRole) return byRole;
    // fall through — a stale/foreign session may still carry a valid field key
  }

  // Path 2: signed field session issued by /api/field/exchange.
  const sessionToken = req.cookies.get(FIELD_ACCESS_COOKIE)?.value;
  if (sessionToken) {
    const parsed = parseFieldToken(sessionToken, "session", Date.now());
    if (!parsed.ok) {
      return { error: NextResponse.json({ error: parsed.error }, { status: parsed.status }) };
    }
    if (parsed.claims.businessId !== businessId) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    const requestedJobId = requestJobId(req);
    if (parsed.claims.jobId && requestedJobId !== parsed.claims.jobId) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    const current = await validateCurrentFieldKey(parsed.claims, parsed.secret);
    if (!current.ok) {
      return { error: NextResponse.json({ error: current.error }, { status: current.status }) };
    }
    await recordFieldAccessAudit(current.db, {
      action: "access",
      businessId,
      tokenId: parsed.claims.tokenId,
      jobId: parsed.claims.jobId,
      request: req,
    });
    return { user: fieldUser(businessId, parsed.claims.tokenId) };
  }

  // Path 3: temporary legacy compatibility. The field page exchanges and strips
  // these immediately; direct API clients retain one deploy cycle to migrate.
  const key = req.headers.get("x-field-key") ?? req.nextUrl.searchParams.get("key");
  if (key && legacyFieldKeyFallbackEnabled()) {
    const current = await loadCurrentFieldKey(businessId);
    if (!current.ok) {
      return { error: NextResponse.json({ error: current.error }, { status: current.status }) };
    }
    if (safeEqual(current.fieldKey, key)) {
      await recordFieldAccessAudit(current.db, {
        action: "legacy_access",
        businessId,
        tokenId: "legacy-direct",
        request: req,
      });
      return { user: fieldUser(businessId, "legacy") };
    }
  }

  return { error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
}

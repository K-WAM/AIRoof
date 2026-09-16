import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { MAX_LOGO_B64_BYTES, MAX_LOGOS, totalLogoBytes } from "@/lib/branding/logo";
import type { LibraryLogo } from "@/types/library";

const VARIANTS: LibraryLogo["variant"][] = ["color", "mono-dark", "mono-light"];
const MIME_TYPES: LibraryLogo["mimeType"][] = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

function logosDoc(db: FirebaseFirestore.Firestore, businessId: string) {
  return db.collection(`businesses/${businessId}/library`).doc("logos");
}

async function loadLogos(db: FirebaseFirestore.Firestore, businessId: string): Promise<LibraryLogo[]> {
  const snap = await logosDoc(db, businessId).get();
  return snap.exists ? ((snap.data()?.logos as LibraryLogo[] | undefined) ?? []) : [];
}

// GET /api/company/library/logos?businessId=xxx
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in auth) return auth.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const logos = await loadLogos(db, businessId);
  return NextResponse.json({ logos });
}

// POST /api/company/library/logos  body: { businessId, name, b64, mimeType, variant, w?, h? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { businessId, name, b64, mimeType, variant, w, h } = body as {
    businessId?: string; name?: string; b64?: string; mimeType?: string; variant?: string; w?: number; h?: number;
  };

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (!name?.trim()) return NextResponse.json({ error: "A name is required" }, { status: 400 });
  if (!b64 || typeof b64 !== "string") return NextResponse.json({ error: "No image data received" }, { status: 400 });
  if (!mimeType || !MIME_TYPES.includes(mimeType as LibraryLogo["mimeType"])) {
    return NextResponse.json({ error: `mimeType must be one of: ${MIME_TYPES.join(", ")}` }, { status: 400 });
  }
  if (!variant || !VARIANTS.includes(variant as LibraryLogo["variant"])) {
    return NextResponse.json({ error: `variant must be one of: ${VARIANTS.join(", ")}` }, { status: 400 });
  }
  // Authoritative — the client-side cap in processLogo() is a friendly first check, not the guard.
  if (b64.length > MAX_LOGO_B64_BYTES) {
    return NextResponse.json({ error: "That image is too large for the logo library." }, { status: 413 });
  }

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) return auth.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const existing = await loadLogos(db, businessId);
  if (existing.length >= MAX_LOGOS) {
    return NextResponse.json({ error: `You can keep at most ${MAX_LOGOS} logos — remove one first.` }, { status: 409 });
  }
  if (totalLogoBytes(existing) + b64.length > MAX_LOGO_B64_BYTES * MAX_LOGOS) {
    return NextResponse.json({ error: "The logo library is full. Remove one before adding another." }, { status: 409 });
  }

  const logo: LibraryLogo = {
    logoId: `logo_${Date.now()}`,
    name: name.trim(),
    b64,
    mimeType: mimeType as LibraryLogo["mimeType"],
    variant: variant as LibraryLogo["variant"],
    ...(typeof w === "number" ? { w } : {}),
    ...(typeof h === "number" ? { h } : {}),
    isDefault: existing.length === 0, // the first upload becomes the default automatically
    createdAt: Date.now(),
  };

  await logosDoc(db, businessId).set({ logos: [...existing, logo], updatedAt: Date.now() }, { merge: true });
  return NextResponse.json({ logo });
}

// PATCH /api/company/library/logos  body: { businessId, logoId, isDefault?, variant?, name? }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { businessId, logoId, isDefault, variant, name } = body as {
    businessId?: string; logoId?: string; isDefault?: boolean; variant?: string; name?: string;
  };
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (!logoId) return NextResponse.json({ error: "logoId required" }, { status: 400 });
  if (variant !== undefined && !VARIANTS.includes(variant as LibraryLogo["variant"])) {
    return NextResponse.json({ error: `variant must be one of: ${VARIANTS.join(", ")}` }, { status: 400 });
  }

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) return auth.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const existing = await loadLogos(db, businessId);
  if (!existing.some((l) => l.logoId === logoId)) {
    return NextResponse.json({ error: "Logo not found" }, { status: 404 });
  }

  const logos = existing.map((l) => {
    if (l.logoId !== logoId) {
      // Only one logo is ever the default — setting a new one clears the rest.
      return isDefault === true ? { ...l, isDefault: false } : l;
    }
    return {
      ...l,
      ...(isDefault !== undefined ? { isDefault } : {}),
      ...(variant !== undefined ? { variant: variant as LibraryLogo["variant"] } : {}),
      ...(name?.trim() ? { name: name.trim() } : {}),
    };
  });

  await logosDoc(db, businessId).set({ logos, updatedAt: Date.now() }, { merge: true });
  return NextResponse.json({ ok: true });
}

// DELETE /api/company/library/logos?businessId=xxx&logoId=xxx
export async function DELETE(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  const logoId = req.nextUrl.searchParams.get("logoId");
  if (!businessId || !logoId) return NextResponse.json({ error: "businessId and logoId required" }, { status: 400 });

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) return auth.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const existing = await loadLogos(db, businessId);
  const removed = existing.find((l) => l.logoId === logoId);
  let logos = existing.filter((l) => l.logoId !== logoId);
  // If the default logo was removed and others remain, promote the next one —
  // otherwise every consumer (invoice, report, email) silently loses its logo
  // even though the business still has one on file.
  if (removed?.isDefault && logos.length > 0 && !logos.some((l) => l.isDefault)) {
    logos = logos.map((l, i) => (i === 0 ? { ...l, isDefault: true } : l));
  }

  await logosDoc(db, businessId).set({ logos, updatedAt: Date.now() }, { merge: true });
  return NextResponse.json({ ok: true });
}

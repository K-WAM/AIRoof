import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { timeBlocksPath, type TimeBlock } from "@/types/schedule";

// GET|POST|DELETE /api/company/time-blocks — an inspector/office blocks time on a crew row so the AI never books
// into it (Phase 31, plan §2.5). GET lists blocks overlapping [from, to]; POST creates one; DELETE removes one.

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BLOCK_MS = 14 * DAY_MS;
const MAX_LABEL_LENGTH = 80;

interface TimeBlockBody {
  businessId?: string;
  crewId?: string;
  startTime?: number;
  endTime?: number;
  label?: string;
}

function parseTimestamp(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const businessId = params.get("businessId");
  const crewId = params.get("crewId");
  const from = parseTimestamp(params.get("from"));
  const to = parseTimestamp(params.get("to"));
  if (!businessId || from === null || to === null) {
    return NextResponse.json({ error: "businessId, from and to are required" }, { status: 400 });
  }
  if (to < from) {
    return NextResponse.json({ error: "to must be on or after from" }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  // Firestore allows one range field: read every block that STARTS within the 14-day lead-in .. `to`, then keep the
  // ones that actually overlap [from, to]. crewId is filtered in code (not in the query) so no composite index is
  // needed alongside the startTime range.
  const snapshot = await db
    .collection(timeBlocksPath(businessId))
    .where("startTime", ">=", from - MAX_BLOCK_MS)
    .where("startTime", "<=", to)
    .orderBy("startTime", "asc")
    .get();

  const blocks = snapshot.docs
    .map((doc) => doc.data() as TimeBlock)
    .filter(
      (block) =>
        typeof block.startTime === "number" &&
        typeof block.endTime === "number" &&
        block.startTime < to &&
        block.endTime > from &&
        (!crewId || block.crewId === crewId)
    );

  return jsonWithCache({ blocks }, "noStore");
}

export async function POST(req: NextRequest) {
  let body: TimeBlockBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { businessId, crewId, startTime, endTime, label } = body;
  if (!businessId || typeof crewId !== "string" || !crewId) {
    return NextResponse.json({ error: "businessId and crewId are required" }, { status: 400 });
  }
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return NextResponse.json({ error: "startTime and endTime must be timestamps" }, { status: 400 });
  }
  if ((endTime as number) <= (startTime as number)) {
    return NextResponse.json({ error: "endTime must be after startTime" }, { status: 400 });
  }
  if ((endTime as number) - (startTime as number) > MAX_BLOCK_MS) {
    return NextResponse.json({ error: "A block can be at most 14 days long" }, { status: 400 });
  }
  const trimmedLabel = typeof label === "string" ? label.trim() : "";
  if (trimmedLabel.length < 1 || trimmedLabel.length > MAX_LABEL_LENGTH) {
    return NextResponse.json({ error: `label must be 1-${MAX_LABEL_LENGTH} characters` }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const businessRef = db.collection("businesses").doc(businessId);
  const crewSnapshot = await businessRef.collection("crews").doc(crewId).get();
  if (!crewSnapshot.exists) {
    return NextResponse.json({ error: "Crew not found" }, { status: 404 });
  }

  const now = Date.now();
  const ref = db.collection(timeBlocksPath(businessId)).doc();
  const block: TimeBlock = {
    blockId: ref.id,
    businessId,
    crewId,
    startTime: startTime as number,
    endTime: endTime as number,
    label: trimmedLabel,
    createdByUid: gate.user.uid,
    createdAt: now,
  };
  await ref.set(block);
  return NextResponse.json({ block }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const businessId = params.get("businessId");
  const blockId = params.get("blockId");
  if (!businessId || !blockId) {
    return NextResponse.json({ error: "businessId and blockId are required" }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const ref = db.collection(timeBlocksPath(businessId)).doc(blockId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }
  await ref.delete();
  return NextResponse.json({ ok: true });
}

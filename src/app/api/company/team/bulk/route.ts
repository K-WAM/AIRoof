import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { TEAM_ROLES, type TeamRole } from "@/types/team";
import { countActiveTeamMembers, inviteTeamMember, DEFAULT_SEAT_LIMIT } from "@/lib/team/invite";

const MAX_ROWS_PER_REQUEST = 200;

interface BulkRow {
  email: string;
  role: string;
}

type RowResult =
  | { email: string; status: "invited"; role: TeamRole }
  | { email: string; status: "already_member" | "conflict" | "invalid" | "seat_limit"; reason: string };

// POST /api/company/team/bulk  body: { businessId, rows: [{ email, role }] }
// CSV import's server side — the client parses the file and posts plain rows
// here so validation/creation stays in one place (inviteTeamMember), same as
// the single-invite route. Stops issuing invites once the seat limit is hit;
// every row still gets a result so the CSV importer can show exactly what
// happened, not a black box.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { businessId, rows } = body as { businessId?: string; rows?: unknown };

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows must be a non-empty array" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS_PER_REQUEST) {
    return NextResponse.json({ error: `Import at most ${MAX_ROWS_PER_REQUEST} rows at a time.` }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "superadmin"]);
  if ("error" in gate) return gate.error;

  const auth = getAdminAuth();
  const db = getAdminFirestore();
  if (!auth || !db) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  const bizSnap = await db.collection("businesses").doc(businessId).get();
  if (!bizSnap.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const business = bizSnap.data()!;
  const seatLimit = (business.seatLimit as number | undefined) ?? DEFAULT_SEAT_LIMIT;

  let activeCount = await countActiveTeamMembers(db, businessId);
  const results: RowResult[] = [];

  for (const raw of rows as BulkRow[]) {
    const email = typeof raw?.email === "string" ? raw.email.trim() : "";
    const role = typeof raw?.role === "string" && raw.role.trim() ? raw.role.trim() : "staff";

    if (!email) {
      results.push({ email: email || "(blank)", status: "invalid", reason: "Missing email" });
      continue;
    }
    if (!TEAM_ROLES.includes(role as TeamRole)) {
      results.push({ email, status: "invalid", reason: `Role must be one of: ${TEAM_ROLES.join(", ")}` });
      continue;
    }
    if (activeCount >= seatLimit) {
      results.push({ email, status: "seat_limit", reason: `Seat limit reached (${seatLimit})` });
      continue;
    }

    try {
      const outcome = await inviteTeamMember({ db, auth, businessId, business, email, role });
      if (outcome.status === "invited") {
        activeCount += 1;
        results.push({ email: outcome.email, status: "invited", role: outcome.role });
      } else if (outcome.status === "already_member") {
        results.push({ email: outcome.email, status: "already_member", reason: outcome.reason });
      } else if (outcome.status === "conflict") {
        results.push({ email: outcome.email, status: "conflict", reason: outcome.reason });
      } else {
        results.push({ email: outcome.email, status: "invalid", reason: outcome.reason });
      }
    } catch (err: unknown) {
      results.push({ email, status: "invalid", reason: (err as Error)?.message ?? "Unknown error" });
    }
  }

  return NextResponse.json({ results });
}

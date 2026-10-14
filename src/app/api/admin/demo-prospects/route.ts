import { NextRequest, NextResponse } from "next/server";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";

export async function GET(request: NextRequest) {
  const gate = await verifySuperadmin(request);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const records = await db.collection("demoProspects").orderBy("createdAt", "desc").limit(20).get();
  return NextResponse.json({ prospects: records.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, name: data.name, companyName: data.companyName, email: data.email, createdAt: data.createdAt };
  }) }, { headers: { "Cache-Control": "no-store" } });
}

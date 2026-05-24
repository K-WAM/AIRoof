import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";

export async function GET() {
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  try {
    const bizSnap = await db.collection("businesses").get();

    const results = await Promise.all(
      bizSnap.docs.map(async (biz) => {
        const id = biz.id;
        const data = biz.data();

        const [callsSnap, leadsSnap, apptsSnap] = await Promise.all([
          db.collection(`businesses/${id}/calls`).count().get(),
          db.collection(`businesses/${id}/leads`).count().get(),
          db.collection(`businesses/${id}/appointments`).count().get(),
        ]);

        return {
          businessId: id,
          businessName: data.businessName ?? id,
          industry: data.industry ?? "—",
          active: data.active ?? false,
          vapiAssistantId: data.vapiAssistantId ?? null,
          calls: callsSnap.data().count,
          leads: leadsSnap.data().count,
          appointments: apptsSnap.data().count,
        };
      })
    );

    return NextResponse.json({ businesses: results });
  } catch (err) {
    console.error("Usage fetch failed:", err);
    return NextResponse.json({ error: "Failed to fetch usage" }, { status: 500 });
  }
}

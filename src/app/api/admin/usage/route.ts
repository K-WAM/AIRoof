import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { monthKey } from "@/lib/usage/meter";
import { monthRange, readBusinessCompanyActivity, readBusinessMonthUsage } from "@/lib/usage/businessMonthUsage";
import { splitByCompany } from "@/lib/admin/overview";
import { isMultiCompany } from "@/lib/companies/companies";

// GET /api/admin/usage?month=YYYY-MM — per client, for one month: team size, calls and phone minutes (read from the
// calls themselves), voice/typed notes (from the usage meter, src/lib/usage/meter.ts) and the estimated cost to us
// (src/lib/billing/aiCostRates.ts). Superadmin only. Reads: one count per client for users, plus
// readBusinessMonthUsage() (the month's calls, capped, and one meter doc) — shared with the Overview.

export async function GET(req: NextRequest) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  const month = req.nextUrl.searchParams.get("month") || monthKey();
  const range = monthRange(month);
  if (!range) return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });

  try {
    const bizSnap = await db.collection("businesses").get();

    const results = await Promise.all(
      bizSnap.docs.map(async (biz) => {
        const id = biz.id;
        const data = biz.data();
        const multi = isMultiCompany(data);

        const [usersSnap, month_, activity] = await Promise.all([
          db.collection("businessUsers").where("businessId", "==", id).count().get(),
          readBusinessMonthUsage(db, id, month, range),
          multi ? readBusinessCompanyActivity(db, id, range) : Promise.resolve({ jobs: [], invoices: [] }),
        ]);
        const basis = month_.costBasis ?? {
          calls: month_.usage.calls,
          phoneMinutes: month_.usage.phoneMinutes,
          vapiMinutes: 0,
          voiceNoteMinutes: month_.usage.voiceNoteMinutes,
          notesRead: 0,
        };
        const companies = multi ? splitByCompany({
          business: data,
          totals: { ...basis, notes: month_.usage.voiceNotes + month_.usage.typedNotes },
          byCompany: month_.usage.byCompany,
          jobs: activity.jobs,
          invoices: activity.invoices,
        }) : [];
        // Per-company counters mean nothing to a single-company client; keep today's usage shape for it.
        const usage = { ...month_.usage };
        if (!multi) delete usage.byCompany;

        return {
          businessId: id,
          businessName: data.businessName ?? id,
          industry: data.industry ?? "—",
          active: data.active ?? false,
          subscriptionStatus: data.subscriptionStatus === "paused" ? "paused" : "active",
          vapiAssistantId: data.vapiAssistantId ?? null,
          voiceProvider: data.voiceProvider === "elevenlabs" ? "elevenlabs" : "vapi",
          elevenLabsAgentId: typeof data.elevenlabs?.agentId === "string" ? data.elevenlabs.agentId : null,
          isDemo: data.isDemo === true || id.startsWith("demo-"),
          usage: { users: usersSnap.data().count, ...usage },
          cost: month_.cost,
          ...(companies.length > 0 ? { companies } : {}),
          // Written daily by the booking canary (/api/cron/booking-canary); null until its first run.
          bookingCheck: data.bookingCheck ?? null,
        };
      })
    );

    results.sort((a, b) => b.cost.total - a.cost.total || String(a.businessName).localeCompare(String(b.businessName), undefined, { sensitivity: "base" }));
    return NextResponse.json({ month, businesses: results });
  } catch (err) {
    console.error("Usage fetch failed:", err);
    return NextResponse.json({ error: "Failed to fetch usage" }, { status: 500 });
  }
}

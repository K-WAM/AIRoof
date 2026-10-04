import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { estimateMonthCost } from "@/lib/billing/aiCostRates";
import { monthKey } from "@/lib/usage/meter";

// GET /api/admin/usage?month=YYYY-MM — per client, for one month: team size, calls and phone minutes (read from the
// calls themselves), voice/typed notes (from the usage meter, src/lib/usage/meter.ts) and the estimated cost to us
// (src/lib/billing/aiCostRates.ts). Superadmin only. Reads: one count per client for users, the month's calls, and one
// meter doc — bounded by MAX_CALLS so a busy month can't eat the free-tier read quota.

const MAX_CALLS = 3000;

function monthRange(key: string): { from: number; to: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { from: Date.UTC(year, month, 1), to: Date.UTC(year, month + 1, 1) };
}

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

        const [usersSnap, callsSnap, meterSnap] = await Promise.all([
          db.collection("businessUsers").where("businessId", "==", id).count().get(),
          db.collection(`businesses/${id}/calls`)
            .where("startedAt", ">=", range.from).where("startedAt", "<", range.to)
            .select("durationSecs", "startedAt", "endedAt", "elevenLabsConversationId")
            .limit(MAX_CALLS).get(),
          db.collection(`businesses/${id}/usageMonths`).doc(month).get(),
        ]);

        let elevenSeconds = 0;
        let vapiSeconds = 0;
        for (const doc of callsSnap.docs) {
          const c = doc.data();
          const seconds = typeof c.durationSecs === "number"
            ? c.durationSecs
            : typeof c.endedAt === "number" && typeof c.startedAt === "number" && c.endedAt > c.startedAt
              ? (c.endedAt - c.startedAt) / 1000
              : 0;
          if (c.elevenLabsConversationId) elevenSeconds += seconds;
          else vapiSeconds += seconds;
        }
        const meter = meterSnap.exists ? meterSnap.data() ?? {} : {};
        const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
        const usage = {
          users: usersSnap.data().count,
          calls: callsSnap.size,
          callsCapped: callsSnap.size >= MAX_CALLS,
          phoneMinutes: Math.round((elevenSeconds + vapiSeconds) / 60),
          voiceNotes: num(meter.voiceNotes),
          voiceNoteMinutes: Math.round(num(meter.voiceSeconds) / 6) / 10,
          typedNotes: num(meter.typedNotes),
        };
        const cost = estimateMonthCost({
          phoneMinutes: elevenSeconds / 60,
          vapiMinutes: vapiSeconds / 60,
          voiceNoteMinutes: num(meter.voiceSeconds) / 60,
          notesRead: num(meter.notesRead),
          calls: callsSnap.size,
        });

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
          usage,
          cost: { phone: round2(cost.phone), ai: round2(cost.ai), total: round2(cost.total) },
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

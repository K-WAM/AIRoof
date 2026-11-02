import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { effectiveAccountPurpose } from "@/lib/accounts/purpose";
import { monthKey } from "@/lib/usage/month";
import { monthRange, readBusinessMonthUsage } from "@/lib/usage/businessMonthUsage";
import { buildOverview, type OverviewClientInput, type OverviewInvoiceInput } from "@/lib/admin/overview";
import { jsonWithCache } from "@/lib/http/cache";

// GET /api/admin/overview — the superadmin's first screen (/admin): every client with its plan price, team size and
// last sign-in, this month's usage and cost, and its Luxor invoice status, plus the money totals and a "Needs you"
// list. Superadmin only. Reads per client: its team (businessUsers) and readBusinessMonthUsage() (shared with the
// Usage page); one luxorInvoices read; sign-in times from Firebase Auth in batches of 100. All the decisions live in
// src/lib/admin/overview.ts.

const MAX_INVOICES = 500;

export async function GET(req: NextRequest) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  const now = Date.now();
  const month = monthKey(now);
  const range = monthRange(month)!;

  try {
    const [bizSnap, invoiceSnap] = await Promise.all([
      db.collection("businesses").get(),
      db.collection("luxorInvoices").orderBy("createdAt", "desc").limit(MAX_INVOICES).get(),
    ]);

    const perBusiness = await Promise.all(
      bizSnap.docs.map(async (biz) => {
        const id = biz.id;
        const purpose = effectiveAccountPurpose(id, biz.data());
        // Archived accounts are left out of the Overview entirely — no reads spent on them.
        if (purpose === "archived") return null;
        const [teamSnap, monthUsage] = await Promise.all([
          db.collection("businessUsers").where("businessId", "==", id).get(),
          readBusinessMonthUsage(db, id, month, range),
        ]);
        // Luxor's own superadmin account can sit on a tenant for previews — it is not the client's user.
        const members = teamSnap.docs
          .filter((d) => d.data().role !== "superadmin")
          .map((d) => ({ uid: d.id, active: d.data().active !== false }));
        return { biz, purpose, members, monthUsage };
      })
    );
    const rows = perBusiness.filter((r): r is NonNullable<typeof r> => r !== null);

    const lastSignIn = new Map<string, number | null>();
    let signInsKnown = true;
    const uids = rows.flatMap((r) => r.members.map((m) => m.uid));
    const auth = getAdminAuth();
    try {
      if (!auth) throw new Error("Admin Auth unavailable");
      for (let i = 0; i < uids.length; i += 100) {
        const result = await auth.getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
        for (const u of result.users) {
          const t = u.metadata.lastSignInTime ? Date.parse(u.metadata.lastSignInTime) : NaN;
          lastSignIn.set(u.uid, Number.isFinite(t) ? t : null);
        }
      }
    } catch (err) {
      signInsKnown = false;
      console.warn("Overview: sign-in times unavailable", err instanceof Error ? err.message : err);
    }

    const businesses: OverviewClientInput[] = rows.map(({ biz, purpose, members, monthUsage }) => {
      const data = biz.data();
      const billing = data.billing ?? {};
      const phoneLineReady = data.voiceProvider === "elevenlabs" ? typeof data.elevenlabs?.agentId === "string" && !!data.elevenlabs.agentId : !!data.vapiAssistantId;
      return {
        businessId: biz.id,
        businessName: typeof data.businessName === "string" && data.businessName ? data.businessName : biz.id,
        industry: typeof data.industry === "string" ? data.industry : "—",
        purpose,
        paused: data.subscriptionStatus === "paused",
        planName: typeof billing.planName === "string" && billing.planName ? billing.planName : null,
        monthlyAmount: typeof billing.monthlyAmount === "number" ? billing.monthlyAmount : null,
        autoInvoice: billing.autoInvoice === true,
        members: members.map((m) => ({ active: m.active, lastSignInAt: lastSignIn.get(m.uid) ?? null })),
        calls: monthUsage.usage.calls,
        phoneMinutes: monthUsage.usage.phoneMinutes,
        notes: monthUsage.usage.voiceNotes + monthUsage.usage.typedNotes,
        cost: monthUsage.cost.total,
        phoneLineReady,
        bookingCheckFailed: data.bookingCheck?.ok === false,
        createdAt: typeof data.createdAt === "number" ? data.createdAt : null,
      };
    });

    const invoices: OverviewInvoiceInput[] = invoiceSnap.docs.map((d) => {
      const x = d.data();
      return {
        invoiceId: d.id,
        businessId: typeof x.businessId === "string" ? x.businessId : undefined,
        clientName: typeof x.clientName === "string" ? x.clientName : undefined,
        total: typeof x.total === "number" ? x.total : 0,
        status: x.status === "paid" || x.status === "sent" ? x.status : "draft",
        dueDate: typeof x.dueDate === "string" ? x.dueDate : undefined,
        createdAt: typeof x.createdAt === "number" ? x.createdAt : undefined,
        paidAt: typeof x.paidAt === "number" ? x.paidAt : undefined,
      };
    });

    const summary = buildOverview(businesses, invoices, month, range, now, signInsKnown);
    return jsonWithCache({ ...summary, signInsKnown, invoicesCapped: invoiceSnap.size >= MAX_INVOICES }, "noStore");
  } catch (err) {
    console.error("Overview fetch failed:", err);
    return NextResponse.json({ error: "Failed to load the overview" }, { status: 500 });
  }
}

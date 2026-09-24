import { NextRequest } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { updateAssistantPersona } from "@/lib/vapi/vapiClient";
import { planPersonaSync } from "@/lib/vapi/syncPersonas";
import type { BusinessConfig } from "@/types";

// POST /api/admin/sync-personas  { dryRun?: boolean }   (superadmin only)
//
// Pushes each tenant's current greeting (with the T-102 recording notice composed in) + prompt to its
// live Vapi assistant — see src/lib/vapi/syncPersonas.ts for why this is needed. DRY RUN BY DEFAULT:
// only an explicit `dryRun: false` writes to Vapi. Each tenant is pushed independently; one failure never
// stops the rest, and every outcome is reported back.
export async function POST(req: NextRequest) {
  const auth = await verifySuperadmin(req);
  if ("error" in auth) {
    auth.error.headers.set("Cache-Control", "no-store");
    return auth.error;
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun !== false;

  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });

  const snap = await db.collection("businesses").get();
  const businesses = snap.docs.map((d) => ({ businessId: d.id, config: d.data() as BusinessConfig }));
  const plan = planPersonaSync(businesses);

  const summary = plan.targets.map((t) => ({
    businessId: t.businessId,
    businessName: t.businessName,
    assistantId: t.assistantId,
    greetingPreview: t.firstMessage.slice(0, 160),
    disclosureEnabled: t.disclosureEnabled,
  }));

  if (dryRun) {
    return jsonWithCache({ dryRun: true, targets: summary, skipped: plan.skipped }, "noStore");
  }

  const results: Array<{ businessId: string; ok: boolean; error?: string }> = [];
  for (const t of plan.targets) {
    try {
      await updateAssistantPersona({
        assistantId: t.assistantId,
        firstMessage: t.firstMessage,
        systemPrompt: t.systemPrompt,
        ...(t.transcriberLanguage ? { transcriberLanguage: t.transcriberLanguage } : {}),
        voiceConfig: t.voiceConfig,
      });
      results.push({ businessId: t.businessId, ok: true });
    } catch (err) {
      results.push({ businessId: t.businessId, ok: false, error: err instanceof Error ? err.message : "Vapi update failed" });
    }
  }

  return jsonWithCache({
    dryRun: false,
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    skipped: plan.skipped,
  }, "noStore");
}

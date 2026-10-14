import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/auth/cronGuard";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";
import { isTrialBusiness, TRIAL_PREFIX } from "@/lib/demo/roofingTrial";
import { Timestamp } from "firebase-admin/firestore";

export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  const db = getAdminFirestore(), auth = getAdminAuth();
  if (!db || !auth) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const expired = await db.collection("demoTrials").where("expiresAt", "<", Date.now() - 86400_000).orderBy("expiresAt").limit(20).get();
  let removed = 0;
  for (const document of expired.docs) {
    const trial = document.data();
    if (!/^[a-f0-9]{32}$/.test(document.id) || trial.businessId !== `${TRIAL_PREFIX}${document.id}` || !isTrialBusiness(trial.businessId) || trial.uid !== `demo-trial-${document.id}`) continue;
    const base = db.collection("businesses").doc(trial.businessId);
    const config = (await base.get()).data();
    if (config?.isDemoTrial !== true || config.isDemo !== true || !(config.demoTrialExpiresAt < Date.now())) continue;
    const member = db.collection("businessUsers").doc(trial.uid);
    if ((await member.get()).data()?.businessId !== trial.businessId) continue;
    await auth.deleteUser(trial.uid).catch((error) => { if (error.code !== "auth/user-not-found") throw error; });
    await member.delete();
    await db.recursiveDelete(base);
    await document.ref.delete();
    removed++;
  }
  const budgets = await db.collection("demoTrialBudgets").where("expiresAt", "<", Timestamp.now()).limit(200).get();
  const batch = db.batch(); budgets.docs.forEach((doc) => batch.delete(doc.ref)); await batch.commit();
  return NextResponse.json({ removed, expiredBudgetsRemoved: budgets.size });
}

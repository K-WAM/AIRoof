// READ-ONLY superadmin audit (T-170). Lists every Firebase Auth account holding the `superadmin` custom claim and every
// businessUsers doc that carries a superadmin flag or role, and says which ones disagree. It never writes anything and
// never prints a credential; emails are masked.
//
//   node scripts/audit-superadmins.mjs
//
// Since T-170 the custom claim is the ONLY platform authority (API guards AND firestore.rules). A doc flag without the
// claim is inert but should be deleted (NH-28); a claim holder who is also an active member of a client tenant is flagged.
import admin from "firebase-admin";
import { ScriptError, maskEmail, parseArgs, serviceAccount } from "./lib/adminCredential.mjs";

const TENANT_ROLES = new Set(["owner", "staff", "crew", "viewer"]);

async function main() {
  parseArgs(process.argv.slice(2), {});
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount()) });
  const auth = admin.auth();
  const db = admin.firestore();

  const claimHolders = new Map();
  let pageToken;
  let scanned = 0;
  do {
    const page = await auth.listUsers(1000, pageToken);
    scanned += page.users.length;
    for (const user of page.users) {
      if (user.customClaims?.superadmin === true) claimHolders.set(user.uid, user);
    }
    pageToken = page.pageToken;
  } while (pageToken);

  const [flagDocs, roleDocs] = await Promise.all([
    db.collection("businessUsers").where("superadmin", "==", true).get(),
    db.collection("businessUsers").where("role", "==", "superadmin").get(),
  ]);
  const docs = new Map();
  for (const snap of [...flagDocs.docs, ...roleDocs.docs]) docs.set(snap.id, snap.data());
  for (const uid of claimHolders.keys()) {
    if (!docs.has(uid)) {
      const snap = await db.collection("businessUsers").doc(uid).get();
      if (snap.exists) docs.set(uid, snap.data());
    }
  }

  const uids = [...new Set([...claimHolders.keys(), ...docs.keys()])];
  const rows = [];
  for (const uid of uids) {
    const user = claimHolders.get(uid) ?? (await auth.getUser(uid).catch(() => null));
    const doc = docs.get(uid);
    const hasClaim = user?.customClaims?.superadmin === true;
    const docFlag = doc?.superadmin === true;
    const docRole = typeof doc?.role === "string" ? doc.role : "-";
    const tenantMember = doc && TENANT_ROLES.has(docRole) && doc.active !== false;
    const findings = [];
    if (docFlag && !hasClaim) findings.push("STALE doc flag without the claim — inert since T-170; delete the field (NH-28)");
    if (docRole === "superadmin" && !hasClaim) findings.push("doc role 'superadmin' without the claim — inert; clean up");
    if (hasClaim && tenantMember) findings.push(`claim holder is ALSO an active ${docRole} of client tenant ${doc.businessId} — review`);
    if (hasClaim && user?.disabled) findings.push("claim holder account is disabled");
    if (!user) findings.push("no Firebase Auth account for this doc");
    rows.push({
      uid,
      email: maskEmail(user?.email ?? doc?.email),
      claim: hasClaim ? "yes" : "no",
      docFlag: docFlag ? "yes" : "no",
      docRole,
      docBusiness: typeof doc?.businessId === "string" ? doc.businessId : "-",
      lastSignIn: user?.metadata?.lastSignInTime ?? "-",
      findings: findings.length ? findings.join("; ") : "ok",
    });
  }

  const flagged = [...docs.values()].filter((doc) => doc?.superadmin === true || doc?.role === "superadmin").length;
  console.log(`Scanned ${scanned} Auth accounts. Superadmin claim holders: ${claimHolders.size}. businessUsers docs with a superadmin flag/role: ${flagged}.`);
  console.log("(read-only — nothing was changed)\n");
  for (const row of rows) {
    console.log(`${row.uid}  ${row.email}`);
    console.log(`    claim=${row.claim}  docFlag=${row.docFlag}  docRole=${row.docRole}  docBusiness=${row.docBusiness}  lastSignIn=${row.lastSignIn}`);
    console.log(`    ${row.findings}`);
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof ScriptError ? `audit-superadmins: ${error.message}` : `audit-superadmins failed: ${error?.message ?? "unknown error"}`);
  process.exit(1);
});

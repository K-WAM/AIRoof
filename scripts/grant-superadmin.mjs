// Grant or revoke platform superadmin — the ONLY supported way (T-170; replaces scripts/provision-superadmin.mjs).
//
//   node scripts/grant-superadmin.mjs --uid <uid> --email <email> --reason "<why>"            (grant)
//   node scripts/grant-superadmin.mjs --uid <uid> --email <email> --reason "<why>" --revoke   (revoke)
//
// Rules: one exact account per run (uid AND email must name the same Firebase Auth user — no email-only matches, no bulk
// input); an interactive typed confirmation; refuses an account that is an active member of a client tenant; merges the
// claim into the account's existing claims; appends an adminAuditEvents record. It NEVER writes superadmin/role/businessId
// onto businessUsers — the custom claim is the only platform authority. A revoke also revokes the account's sessions so
// the change is immediate. The target must sign out and back in; re-run scripts/audit-superadmins.mjs to verify.
import admin from "firebase-admin";
import { hostname, userInfo } from "node:os";
import { createInterface } from "node:readline/promises";
import { ScriptError, maskEmail, parseArgs, serviceAccount } from "./lib/adminCredential.mjs";

const TENANT_ROLES = new Set(["owner", "staff", "crew", "viewer"]);

async function confirm(expected) {
  if (!process.stdin.isTTY) throw new ScriptError("This script needs an interactive terminal for the typed confirmation");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Type the full email address to confirm: `);
    if (answer.trim().toLowerCase() !== expected.toLowerCase()) throw new ScriptError("Confirmation did not match — nothing changed");
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { values: ["uid", "email", "reason"], switches: ["revoke"] });
  if (!args.uid || !args.email || !args.reason) throw new ScriptError("Required: --uid <uid> --email <email> --reason \"<why>\"");
  if (!/^[A-Za-z0-9]{10,128}$/.test(args.uid)) throw new ScriptError("--uid must be one Firebase uid");
  if (args.reason.trim().length < 8) throw new ScriptError("--reason must say why (at least 8 characters)");
  const revoke = args.revoke === true;

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount()) });
  const auth = admin.auth();
  const db = admin.firestore();

  const user = await auth.getUser(args.uid).catch(() => null);
  if (!user) throw new ScriptError("No Firebase Auth account has that uid");
  if ((user.email ?? "").toLowerCase() !== args.email.trim().toLowerCase()) throw new ScriptError("That uid and that email are not the same account");

  const member = await db.collection("businessUsers").doc(user.uid).get();
  const memberData = member.exists ? member.data() : null;
  if (!revoke && memberData && TENANT_ROLES.has(memberData.role) && memberData.active !== false) {
    throw new ScriptError(`Refused: this account is an active ${memberData.role} of client tenant ${memberData.businessId}. Use a separate platform account.`);
  }

  const claims = { ...(user.customClaims ?? {}) };
  const already = claims.superadmin === true;
  if (!revoke && already) throw new ScriptError("That account already holds the superadmin claim — nothing to do");
  if (revoke && !already) throw new ScriptError("That account does not hold the superadmin claim — nothing to do");

  console.log(`${revoke ? "REVOKE" : "GRANT"} platform superadmin`);
  console.log(`  account: ${user.uid}  ${maskEmail(user.email)}`);
  console.log(`  reason:  ${args.reason}`);
  await confirm(user.email);

  if (revoke) delete claims.superadmin;
  else claims.superadmin = true;
  await auth.setCustomUserClaims(user.uid, claims);
  if (revoke) await auth.revokeRefreshTokens(user.uid);

  const now = Date.now();
  const auditRef = db.collection("adminAuditEvents").doc(`audit_superadmin_${now}_${user.uid}`);
  await auditRef.create({
    auditEventId: auditRef.id,
    action: revoke ? "superadmin.revoked" : "superadmin.granted",
    actorUid: "operator-script",
    actorEmail: null,
    operator: `${userInfo().username}@${hostname()}`,
    targetUid: user.uid,
    reason: args.reason,
    createdAt: now,
  });

  console.log(`Done. The account must sign out and back in; then run: node scripts/audit-superadmins.mjs`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof ScriptError ? `grant-superadmin: ${error.message}` : `grant-superadmin failed: ${error?.message ?? "unknown error"}`);
  process.exit(1);
});

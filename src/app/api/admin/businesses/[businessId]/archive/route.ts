import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { jsonWithCache } from "@/lib/http/cache";
import type { AccountPurpose, AdminAuditEvent, BusinessConfig } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { effectiveAccountPurpose, isDemoTenant } from "@/lib/accounts/purpose";

// POST /api/admin/businesses/[businessId]/archive — hide a client from the Clients list without deleting anything
// (T-349). Superadmin only, one audited write. Body: { archived: boolean }. Archiving stores the purpose it had in
// previousAccountPurpose so Restore can put it back; a client with no stored purpose is restored to unclassified.
// Demo tenants are server-derived and refused. This route never touches the config PUT's many other fields.

class ArchiveRouteError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ArchiveRouteError";
  }
}

/** Only a real, settable purpose can be restored. Demo is derived, archived would need another previous. */
function restorablePurpose(value: unknown): "client" | "test" | null {
  return value === "client" || value === "test" ? value : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const gate = await verifySuperadmin(request);
  if ("error" in gate) return gate.error;

  const { businessId } = await params;
  const body = (await request.json().catch(() => ({}))) as { archived?: unknown };
  if (typeof body.archived !== "boolean") {
    return jsonWithCache({ error: "archived must be true or false" }, "noStore", { status: 400 });
  }

  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Firestore not available" }, "noStore", { status: 503 });

  const businessRef = db.collection("businesses").doc(businessId);
  const now = Date.now();
  const auditRef = db.collection("adminAuditEvents").doc(`audit_${now}`);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const businessDoc = await transaction.get(businessRef);
      if (!businessDoc.exists) {
        throw new ArchiveRouteError(`Business ${businessId} not found`, 404);
      }

      const currentConfig = businessDoc.data() as BusinessConfig;
      if (isDemoTenant(businessId, currentConfig)) {
        throw new ArchiveRouteError("Demo accounts can't be archived.", 400);
      }

      const current = effectiveAccountPurpose(businessId, currentConfig);

      if (body.archived) {
        if (current === "archived") {
          return {
            accountPurpose: "archived" as const,
            previousAccountPurpose: restorablePurpose(currentConfig.previousAccountPurpose),
          };
        }
        const previous = restorablePurpose(current);
        transaction.update(businessRef, {
          accountPurpose: "archived",
          ...(previous ? { previousAccountPurpose: previous } : { previousAccountPurpose: FieldValue.delete() }),
          updatedAt: now,
        } satisfies Record<string, unknown>);

        const auditEvent: AdminAuditEvent = {
          auditEventId: auditRef.id,
          actorUid: gate.user.uid,
          actorEmail: gate.user.email,
          businessId,
          action: "business.archived",
          targetPath: `businesses/${businessId}`,
          before: { accountPurpose: current, previousAccountPurpose: currentConfig.previousAccountPurpose ?? null },
          after: { accountPurpose: "archived", previousAccountPurpose: previous },
          createdAt: now,
        };
        transaction.set(auditRef, auditEvent);
        return { accountPurpose: "archived" as const, previousAccountPurpose: previous };
      }

      if (current !== "archived") {
        throw new ArchiveRouteError("This client is not archived.", 400);
      }

      const restored = restorablePurpose(currentConfig.previousAccountPurpose);
      transaction.update(businessRef, {
        ...(restored ? { accountPurpose: restored } : { accountPurpose: FieldValue.delete() }),
        previousAccountPurpose: FieldValue.delete(),
        updatedAt: now,
      } satisfies Record<string, unknown>);

      const auditEvent: AdminAuditEvent = {
        auditEventId: auditRef.id,
        actorUid: gate.user.uid,
        actorEmail: gate.user.email,
        businessId,
        action: "business.restored",
        targetPath: `businesses/${businessId}`,
        before: { accountPurpose: current, previousAccountPurpose: currentConfig.previousAccountPurpose ?? null },
        after: { accountPurpose: restored, previousAccountPurpose: null },
        createdAt: now,
      };
      transaction.set(auditRef, auditEvent);
      return { accountPurpose: restored as AccountPurpose | null, previousAccountPurpose: null };
    });

    return jsonWithCache({ success: true, ...result }, "noStore");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = error instanceof ArchiveRouteError ? error.status : 500;
    if (status === 500) console.error("POST /api/admin/businesses/[businessId]/archive error:", error);
    return jsonWithCache({ error: message }, "noStore", { status });
  }
}

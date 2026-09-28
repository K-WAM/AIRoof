import type { Firestore } from "firebase-admin/firestore";
import { buildInspectionEmail, type Branding, type InspectionChange } from "@/lib/notify";
import { crewEmailRecipients } from "@/lib/crews/recipients";
import { resolveLetterhead } from "@/lib/documents/letterhead";
import { runLedgeredEmail } from "@/lib/tools/agentTools";
import { isSmsEnabled, sendSms } from "@/lib/comms/sms";
import { inspectorAssigned } from "@/lib/comms/smsTemplates";
import type { LibraryLogo } from "@/types/library";

export type InspectorChange = "assigned" | "moved" | "reassigned_away" | "cancelled";

const DEFAULT_TIMEZONE = "America/New_York";

function emailChange(change: InspectorChange): InspectionChange {
  return change === "reassigned_away" ? "reassigned" : change;
}

/** The note lines that begin with `prefix` (e.g. "access:" / "urgent:"), trimmed. */
function notesLines(notes: unknown, prefix: string): string[] {
  if (typeof notes !== "string") return [];
  return notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().startsWith(prefix));
}

/**
 * Phase 31 (T-152): tell an inspector (crew row) about an assignment change. Emails every recipient from the shared
 * crew recipients helper (one ledger entry each, so a repeat never double-sends) plus a text to the crew row's phone
 * when texting is enabled. Never throws — logs and returns the delivered counts.
 */
export async function notifyInspector(options: {
  db: Firestore;
  businessId: string;
  appointment: Record<string, unknown>;
  change: InspectorChange;
  crewId: string;
}): Promise<{ emailed: number; texted: number }> {
  try {
    const { db, businessId, appointment, change, crewId } = options;
    const [businessSnapshot, crewSnapshot] = await Promise.all([
      db.collection("businesses").doc(businessId).get(),
      db.collection("businesses").doc(businessId).collection("crews").doc(crewId).get(),
    ]);
    const business = businessSnapshot.data() ?? {};
    const crew = crewSnapshot.data() ?? {};

    const timeZone =
      typeof business.timezone === "string" && business.timezone ? business.timezone : DEFAULT_TIMEZONE;
    const startTime = typeof appointment.startTime === "number" ? appointment.startTime : null;
    const when =
      startTime === null
        ? "the scheduled time"
        : new Date(startTime).toLocaleString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZone,
          });
    const appointmentId =
      typeof appointment.appointmentId === "string" && appointment.appointmentId
        ? appointment.appointmentId
        : "appointment";
    const keyPrefix = `${appointmentId}:${change}:${startTime ?? ""}`;

    const logosSnapshot = await db
      .collection(`businesses/${businessId}/library`)
      .doc("logos")
      .get();
    const resolved = resolveLetterhead(
      business,
      (logosSnapshot.data()?.logos as LibraryLogo[] | undefined) ?? [],
      "brand-bar"
    );
    const brand: Branding = {
      businessName: typeof business.businessName === "string" ? business.businessName : "Your Company",
      brandColor: typeof business.brandColor === "string" ? business.brandColor : undefined,
      logoUrl: resolved.logoUrl,
      logoFilter: resolved.logoStyle.filter as string | undefined,
      logoChip: resolved.logoChip,
      contactPhone: typeof business.contactPhone === "string" ? business.contactPhone : undefined,
      contactEmail: typeof business.contactEmail === "string" ? business.contactEmail : undefined,
    };

    const { subject, html } = buildInspectionEmail({
      brand,
      change: emailChange(change),
      when,
      customerName: typeof appointment.callerName === "string" ? appointment.callerName : undefined,
      customerPhone: typeof appointment.callerPhone === "string" ? appointment.callerPhone : undefined,
      address: typeof appointment.address === "string" ? appointment.address : undefined,
      accessLines: notesLines(appointment.notes, "access:"),
      urgentLines: notesLines(appointment.notes, "urgent:"),
      callSummary: typeof appointment.callSummary === "string" ? appointment.callSummary : undefined,
    });

    const recipients = await crewEmailRecipients({
      db,
      businessId,
      crewId,
      crewEmail: typeof crew.email === "string" ? crew.email : null,
      keyPrefix,
      // The crew row's own entry is keyed by its id so the ledger key reads ...:startTime:<recipient>.
      crewEntityId: `${keyPrefix}:${crewId}`,
    });

    let emailed = 0;
    for (const recipient of recipients) {
      const status = await runLedgeredEmail({
        firestore: db,
        businessId,
        messageType: "inspector-assignment",
        entityId: recipient.entityId,
        entityRef: { collection: "appointments", id: appointmentId },
        to: recipient.to,
        subject,
        html,
      });
      if (status === "delivered") emailed += 1;
    }

    let texted = 0;
    const shouldText = change === "assigned" || change === "moved";
    if (shouldText && isSmsEnabled(business)) {
      const phone = typeof crew.phone === "string" ? crew.phone.trim() : "";
      if (phone) {
        const status = await sendSms({
          businessId,
          to: phone,
          body: inspectorAssigned({
            when,
            street: typeof appointment.address === "string" ? appointment.address : "the site",
            customerName: typeof appointment.callerName === "string" ? appointment.callerName : "the customer",
          }),
          messageType: "inspector-assignment",
          entityId: `${keyPrefix}:text`,
        });
        if (status === "delivered") texted += 1;
      }
    }

    return { emailed, texted };
  } catch (error) {
    console.error("notifyInspector failed:", error);
    return { emailed: 0, texted: 0 };
  }
}

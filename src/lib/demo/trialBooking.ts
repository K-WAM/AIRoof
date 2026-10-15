import { getAdminFirestore } from "@/lib/firebase/admin";
import { buildCustomerConfirmationEmail } from "@/lib/notify";
import { sendWithLedger } from "@/lib/comms/send";
import { isTrialBusiness, TRIAL_PREFIX, type RoofingTrial } from "./roofingTrial";

/** Only a server-bound private demo can opt into automatic demonstration confirmation. */
export async function finishTrialBooking(businessId: string, callId: string, appointmentId: string) {
  if (!isTrialBusiness(businessId)) return null;
  const db = getAdminFirestore()!;
  const trialRef = db.collection("demoTrials").doc(businessId.slice(TRIAL_PREFIX.length));
  const ref = db.collection("businesses").doc(businessId).collection("appointments").doc(appointmentId);
  const result = await db.runTransaction(async (tx) => {
    const [trialSnap, apptSnap, businessSnap] = await Promise.all([tx.get(trialRef), tx.get(ref), tx.get(db.collection("businesses").doc(businessId))]);
    const trial = trialSnap.data() as RoofingTrial | undefined, appointment = apptSnap.data();
    const business = businessSnap.data();
    if (!trial || trial.businessId !== businessId || trial.expiresAt <= Date.now() || !trial.conversationIds.some((id) => callId === `call_elevenlabs_${id}`) || !appointment || appointment.sourceCallId !== callId || business?.isDemoTrial !== true || business.isDemo !== true || !(business.demoTrialExpiresAt > Date.now())) return null;
    tx.update(ref, { status: "confirmed", pendingConfirmation: false, jobId: "J-1001", callerEmail: trial.email, updatedAt: Date.now() });
    tx.update(db.collection("businesses").doc(businessId).collection("jobs").doc("J-1001"), {
      title: "Your Demo Roof Inspection", clientName: appointment.callerName, clientPhone: appointment.callerPhone,
      clientEmail: trial.email, address: appointment.address || "Demo roof inspection", serviceType: appointment.serviceType || "Roof inspection",
      sourceCallId: callId, sourceAppointmentId: ref.id, scheduledStart: appointment.startTime, scheduledEnd: appointment.endTime, updatedAt: Date.now(),
    });
    tx.set(db.collection("businesses").doc(businessId).collection("requestJobs").doc(`appointment_${ref.id}`), { jobId: "J-1001", createdAt: Date.now() });
    const send = Boolean(trial.email) && (!trial.confirmationAppointmentId || trial.confirmationAppointmentId === ref.id);
    if (send) tx.update(trialRef, { confirmationAppointmentId: ref.id });
    return { trial, appointment, send };
  });
  if (!result) return null;
  const when = new Date(result.appointment.startTime).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  if (!result.send || !result.trial.email) return { when, email: "not_requested" };
  const template = buildCustomerConfirmationEmail({ brand: { businessName: result.trial.companyName, brandColor: "#0f766e", contactEmail: "connect@luxordev.com" },
    clientName: result.appointment.callerName, serviceType: "Demo roof inspection — no real service visit", when: `${when} Eastern`, address: result.appointment.address });
  const delivered = await sendWithLedger({ firestore: db, businessId, to: result.trial.email, subject: `[Demo] ${template.subject}`, html: template.html,
    messageType: "demo-booking-confirmation", entityId: ref.id, entityRef: { collection: "appointments", id: ref.id } });
  return { when, email: delivered };
}

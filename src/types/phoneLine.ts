// Phone-line registry (Phase 32, T-171/T-169 — contract C-B in MASTER_PLAN.md). One record per inbound number, stored on
// the existing `businessPhoneNumbers/{lineId}` docs (their original fields stay; everything below is optional there).
//
// This registry is the OPERATOR-FACING truth about a line — who owns it, whether it is connected and tested, and whether it
// may send texts. It does NOT route calls: live routing still reads `businesses.elevenlabs.phoneNumber/extraPhoneNumbers`
// (and `vapiPhoneNumberId`). The only write that touches routing is an explicit, confirmed `go_live`/`retire`.

export type LineCountry = "US" | "CA";
export type LinePurpose = "client" | "demo";
export type LineAcquisition = "new" | "forward" | "port_in";
export type LineProvider = "elevenlabs" | "vapi";

/** Draft → Provisioned → Connected → Test passed → Live → Retired. Only "test_passed" and "live" may show Dial/Copy. */
export type LineStatus = "draft" | "provisioned" | "connected" | "test_passed" | "live" | "retired";
export const LINE_STATUSES: readonly LineStatus[] = ["draft", "provisioned", "connected", "test_passed", "live", "retired"];

export type SmsStatus = "not_configured" | "pending_registration" | "ready" | "blocked";
export const SMS_STATUSES: readonly SmsStatus[] = ["not_configured", "pending_registration", "ready", "blocked"];

/** Which texts a line may send. Only messages that exist today — there is no OTP/identity-verification text. */
export type SmsPurpose = "booking_received" | "appointment_confirmed" | "inspector_assigned" | "field_link";
export const SMS_PURPOSES: readonly SmsPurpose[] = ["booking_received", "appointment_confirmed", "inspector_assigned", "field_link"];

export interface LineSms {
  status: SmsStatus;
  purposes: SmsPurpose[];
  /** The line texts come from when a record has no dialed line (office-made bookings, inspector notices) — decision D4. */
  isDefaultSender: boolean;
}

/** What the admin and company read endpoints return. The company endpoint omits `provider`. */
export interface PhoneLineView {
  lineId: string;
  businessId: string;
  e164: string;
  /** "+1 (689) 204-2643" */
  display: string;
  country: LineCountry;
  label: string;
  purpose: LinePurpose;
  provider?: LineProvider;
  acquisition?: LineAcquisition;
  status: LineStatus;
  lastTestAt?: number;
  sms: LineSms;
  /** Plain-language next step, e.g. "Luxor connects this line". */
  nextStep: string;
}

/** The routing a `go_live` replaced, kept on the line so `retire` can put it back. */
export interface PreviousRouting {
  businessId: string;
  elevenlabsPhoneNumber?: string | null;
  elevenlabsExtraPhoneNumbers?: string[];
  capturedAt: number;
}

/** Registry fields stored on a `businessPhoneNumbers` doc (all optional so pre-registry docs stay valid). */
export interface PhoneLineRegistryFields {
  country?: LineCountry;
  purpose?: LinePurpose;
  provider?: LineProvider;
  acquisition?: LineAcquisition;
  status?: LineStatus;
  sms?: LineSms;
  lastTestAt?: number;
  lastTestCallId?: string;
  previousRouting?: PreviousRouting;
  updatedBy?: string;
}

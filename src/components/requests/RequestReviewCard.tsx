"use client";

import { useState } from "react";
import { missingRequestInformation, type RequestReviewEntity } from "@/lib/pipeline/requestReview";
import { REQUEST_DECLINE_REASONS, type RequestDeclineReason } from "@/lib/comms/requestDeclineEmail";
import { BookingDetails } from "@/components/appointments/BookingDetails";

export type ReviewRequest = RequestReviewEntity & {
  callerName?: string;
  urgency?: string;
  preferredTime?: string;
  startTime?: number;
  notes?: string;
  status: string;
  afterHours?: boolean;
  escalated?: boolean;
  textOk?: boolean;
  assignedBy?: "ai" | "office";
  callSummary?: string;
  assignedCrewName?: string;
};
export type ReviewCall = {
  summary?: string;
  recordingUrl?: string;
  transcript?: Array<{ role: string; text: string }>;
};

export function RequestReviewCard({ request, call, timeZone, smsEnabled = false, intakeLabelFor, jobNoun, canCreateJob, onAccept, onDecline, onCallBack }: {
  request: ReviewRequest;
  call?: ReviewCall;
  timeZone?: string;
  smsEnabled?: boolean;
  intakeLabelFor: (key: string) => string;
  jobNoun: string;
  canCreateJob: boolean;
  onAccept: (notifyChannel: "sms" | "email" | "none") => Promise<void>;
  onDecline: (reason: RequestDeclineReason, customMessage?: string) => Promise<void>;
  onCallBack?: () => Promise<void>;
}) {
  const canText = smsEnabled && !!request.callerPhone && request.textOk !== false;
  const canEmail = !!request.callerEmail;
  const [notifyChannel, setNotifyChannel] = useState<"sms" | "email" | "none">(canText ? "sms" : canEmail ? "email" : "none");
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<RequestDeclineReason>("Outside our service area");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<"accept" | "decline" | "call" | null>(null);
  const [transcript, setTranscript] = useState(false);
  const [decline, setDecline] = useState(false);
  const missing = missingRequestInformation(request);

  const act = async (action: "accept" | "decline" | "call") => {
    setBusy(action);
    setError(null);
    try {
      if (action === "accept") await onAccept(notifyChannel);
      if (action === "decline") await onDecline(reason, reason === "Other" ? custom.trim() : undefined);
      if (action === "call" && onCallBack) await onCallBack();
    } catch (err) {
      // These used to fail silently (an unhandled rejection) — the button just stopped spinning.
      setError(err instanceof Error ? err.message : "That did not work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="request-review-card" aria-label="Request review">
      <div className="request-review-heading">
        <div>
          <h2>{request.callerName || "Unknown caller"}</h2>
          <p>{request.callerPhone || "No phone"}{request.callerEmail ? ` · ${request.callerEmail}` : ""}</p>
        </div>
        {/* Only what needs attention gets a chip — "normal" said nothing and read like a status. */}
        {request.escalated
          ? <span className="tag urgent" title="The AI escalated this call as an emergency">Escalated</span>
          : request.urgency?.toLowerCase() === "urgent" && <span className="tag urgent">Urgent</span>}
      </div>

      <div className="request-review-grid"><div><b>Service</b><span>{request.serviceRequested || request.serviceType || "Not specified"}</span></div></div>
      {request.startTime
        ? <BookingDetails booking={{ ...request, callSummary: request.callSummary || call?.summary }} inspectorName={request.assignedCrewName} timeZone={timeZone} />
        : <div className="request-review-grid"><div><b>Address</b><span>{request.address || "Not provided"}</span></div>{request.preferredTime && <div><b>Requested time</b><span>{request.preferredTime}</span></div>}</div>}

      {missing.length > 0 && (
        <div className="request-missing">
          <strong>Missing information:</strong> {missing.join(", ")}. {onCallBack && (
            <button className="button small secondary" onClick={() => act("call")} disabled={busy !== null}>
              {busy === "call" ? "Calling…" : "AI call back to collect it"}
            </button>
          )}
        </div>
      )}

      {request.intake && <dl className="request-intake">{Object.entries(request.intake).map(([key, value]) => (
        <div key={key}><dt>{intakeLabelFor(key)}</dt><dd>{value}</dd></div>
      ))}</dl>}
      {!request.startTime && request.notes && <p>{request.notes}</p>}
      {!request.startTime && call?.summary && <div className="summary-block"><b>From the call</b><p>{call.summary}</p></div>}
      {call?.recordingUrl && <audio controls src={call.recordingUrl} style={{ width: "100%" }} />}
      {call?.transcript?.length && <>
        <button className="button small secondary" onClick={() => setTranscript(!transcript)}>{transcript ? "Hide transcript" : "Show transcript excerpt"}</button>
        {transcript && <div className="transcript">{call.transcript.filter((message) => message.text?.trim()).slice(0, 8).map((message, index) => <p key={index}><b>{message.role}:</b> {message.text}</p>)}</div>}
      </>}

      <div className="request-review-actions">
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>Tell them by:</legend>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {canText && <label><input type="radio" name="notify-channel" value="sms" checked={notifyChannel === "sms"} onChange={() => setNotifyChannel("sms")} /> Text</label>}
            {canEmail && <label><input type="radio" name="notify-channel" value="email" checked={notifyChannel === "email"} onChange={() => setNotifyChannel("email")} /> Email</label>}
            <label><input type="radio" name="notify-channel" value="none" checked={notifyChannel === "none"} onChange={() => setNotifyChannel("none")} /> I&apos;ll call them</label>
          </div>
          {notifyChannel === "none" && request.callerPhone && <a href={`tel:${request.callerPhone}`} style={{ display: "inline-block", marginTop: 6 }}>Call {request.callerPhone}</a>}
        </fieldset>
        <button className="button primary" onClick={() => act("accept")} disabled={busy !== null}>{busy === "accept" ? "Confirming…" : notifyChannel === "sms" ? "Confirm & text" : notifyChannel === "email" ? "Confirm & email" : canCreateJob ? `Confirm & create ${jobNoun}` : "Confirm"}</button>
        <button className="button secondary" onClick={() => setDecline(!decline)} disabled={busy !== null}>Decline & notify</button>
      </div>

      {error && <p role="alert" className="request-missing">{error}</p>}

      {decline && <div className="request-decline">
        <label>Reason <select value={reason} onChange={(event) => setReason(event.target.value as RequestDeclineReason)}>{REQUEST_DECLINE_REASONS.map((item) => <option key={item}>{item}</option>)}</select></label>
        {reason === "Other" && <textarea maxLength={300} value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Optional note for the customer" />}
        <p>Preview: We’re unable to move forward with this request at this time.</p>
        <button className="button primary" onClick={() => act("decline")} disabled={busy !== null}>{busy === "decline" ? "Declining…" : "Send decline"}</button>
      </div>}
    </section>
  );
}

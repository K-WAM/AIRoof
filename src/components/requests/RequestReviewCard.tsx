"use client";

import { useState } from "react";
import { missingRequestInformation, type RequestReviewEntity } from "@/lib/pipeline/requestReview";
import { REQUEST_DECLINE_REASONS, type RequestDeclineReason } from "@/lib/comms/requestDeclineEmail";

export type ReviewRequest = RequestReviewEntity & {
  callerName?: string;
  urgency?: string;
  preferredTime?: string;
  startTime?: number;
  notes?: string;
  status: string;
  afterHours?: boolean;
  escalated?: boolean;
};
export type ReviewCall = {
  summary?: string;
  recordingUrl?: string;
  transcript?: Array<{ role: string; text: string }>;
};

export function RequestReviewCard({ request, call, intakeLabelFor, jobNoun, canCreateJob, onAccept, onDecline, onCallBack }: {
  request: ReviewRequest;
  call?: ReviewCall;
  intakeLabelFor: (key: string) => string;
  jobNoun: string;
  canCreateJob: boolean;
  onAccept: (notifyByCall: boolean) => Promise<void>;
  onDecline: (reason: RequestDeclineReason, customMessage?: string) => Promise<void>;
  onCallBack?: () => Promise<void>;
}) {
  const [notifyByCall, setNotifyByCall] = useState(false);
  const [reason, setReason] = useState<RequestDeclineReason>("Outside our service area");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<"accept" | "decline" | "call" | null>(null);
  const [transcript, setTranscript] = useState(false);
  const [decline, setDecline] = useState(false);
  const missing = missingRequestInformation(request);

  const act = async (action: "accept" | "decline" | "call") => {
    setBusy(action);
    try {
      if (action === "accept") await onAccept(notifyByCall);
      if (action === "decline") await onDecline(reason, reason === "Other" ? custom.trim() : undefined);
      if (action === "call" && onCallBack) await onCallBack();
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
        <span className="tag">{request.urgency || "normal"}</span>
      </div>

      <div className="request-review-grid">
        <div><b>Service</b><span>{request.serviceRequested || request.serviceType || "Not specified"}</span></div>
        <div><b>Address</b><span>{request.address || "Not provided"}</span></div>
        {(request.preferredTime || request.startTime) && <div><b>Requested time</b><span>{request.preferredTime || new Date(request.startTime!).toLocaleString()}</span></div>}
      </div>

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
      {request.notes && <p>{request.notes}</p>}
      {call?.summary && <div className="summary-block"><b>AI call summary</b><p>{call.summary}</p></div>}
      {call?.recordingUrl && <audio controls src={call.recordingUrl} style={{ width: "100%" }} />}
      {call?.transcript?.length && <>
        <button className="button small secondary" onClick={() => setTranscript(!transcript)}>{transcript ? "Hide transcript" : "Show transcript excerpt"}</button>
        {transcript && <div className="transcript">{call.transcript.slice(0, 8).map((message, index) => <p key={index}><b>{message.role}:</b> {message.text}</p>)}</div>}
      </>}

      <div className="request-review-actions">
        <label><input type="checkbox" checked={notifyByCall} onChange={(event) => setNotifyByCall(event.target.checked)} /> Have the AI phone them to confirm</label>
        <button className="button primary" onClick={() => act("accept")} disabled={busy !== null}>{busy === "accept" ? "Confirming…" : canCreateJob ? `Confirm & create ${jobNoun}` : "Confirm appointment"}</button>
        <button className="button secondary" onClick={() => setDecline(!decline)} disabled={busy !== null}>Decline & notify</button>
      </div>

      {decline && <div className="request-decline">
        <label>Reason <select value={reason} onChange={(event) => setReason(event.target.value as RequestDeclineReason)}>{REQUEST_DECLINE_REASONS.map((item) => <option key={item}>{item}</option>)}</select></label>
        {reason === "Other" && <textarea maxLength={300} value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Optional note for the customer" />}
        <p>Preview: We’re unable to move forward with this request at this time.</p>
        <button className="button primary" onClick={() => act("decline")} disabled={busy !== null}>{busy === "decline" ? "Declining…" : "Send decline"}</button>
      </div>}
    </section>
  );
}

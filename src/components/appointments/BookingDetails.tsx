import { fmtPhone } from "@/lib/format";
import { useBusinessModules } from "@/hooks/useBusinessModules";

export interface BookingDetailsValue {
  callerName?: string;
  callerPhone?: string;
  callerEmail?: string;
  address?: string;
  notes?: string;
  startTime?: number;
  textOk?: boolean;
  assignedBy?: "ai" | "office";
  callSummary?: string;
}

function noteLines(notes?: string) {
  if (!notes) return [];
  return notes.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function BookingDetails({ booking, inspectorName, timeZone, compact = false, showName = true, showTime = true }: {
  booking: BookingDetailsValue;
  inspectorName?: string;
  timeZone?: string;
  compact?: boolean;
  showName?: boolean;
  /** False where the card already prints the date and time big (Pipeline) — never say it twice. */
  showTime?: boolean;
}) {
  const notes = noteLines(booking.notes);
  // Field trades book an inspection visit; appointment industries (dental, care homes…) book with a provider/director.
  const { calendarMode, vocab } = useBusinessModules();
  const assigneeLabel = calendarMode === "appointments" ? vocab.resourceNoun : "Inspector";
  return (
    <div className="booking-details" style={{ display: "grid", gap: compact ? 5 : 8, fontSize: compact ? 12 : 13, lineHeight: 1.45 }}>
      {showTime && booking.startTime && <div><strong>Time:</strong> {new Date(booking.startTime).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", ...(timeZone ? { timeZone } : {}) })}</div>}
      {showName && <div><strong>Name:</strong> {booking.callerName || "Unknown caller"}</div>}
      {booking.callerPhone && <div><strong>Phone:</strong> <a href={`tel:${booking.callerPhone}`}>{fmtPhone(booking.callerPhone)}</a></div>}
      {booking.address && <div><strong>Address:</strong> <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(booking.address)}`} target="_blank" rel="noreferrer">{booking.address}</a></div>}
      {booking.callerEmail && <div><strong>Email:</strong> <a href={`mailto:${booking.callerEmail}`}>{booking.callerEmail}</a></div>}
      {booking.textOk === true && <div><span className="tag">OK to text</span></div>}
      {inspectorName && <div><strong>{assigneeLabel}:</strong> {inspectorName}{booking.assignedBy === "ai" ? " · assigned by AI" : ""}</div>}
      {notes.length > 0 && <div style={{ display: "grid", gap: 4 }}>
        <strong>Notes</strong>
        {notes.map((line, index) => {
          const important = /^(Access|URGENT):/i.test(line);
          return <span key={`${line}-${index}`} style={important ? { padding: "4px 7px", borderRadius: 6, background: line.toUpperCase().startsWith("URGENT:") ? "#fef2f2" : "#fffbeb", color: line.toUpperCase().startsWith("URGENT:") ? "#b91c1c" : "#92400e", fontWeight: 700 } : undefined}>{line}</span>;
        })}
      </div>}
      {booking.callSummary && <div className="summary-block" style={{ margin: 0 }}><strong>From the call</strong><p style={{ margin: "4px 0 0" }}>{booking.callSummary}</p></div>}
    </div>
  );
}

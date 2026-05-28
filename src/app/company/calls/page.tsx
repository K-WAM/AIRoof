"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";

interface CallMessage {
  role: "caller" | "agent" | "system" | string;
  text: string;
  timestamp: number;
}

interface Call {
  callId: string;
  callerPhone?: string;
  targetPhone?: string;
  callType?: "inbound" | "outbound";
  status: string;
  startedAt: number;
  endedAt?: number;
  summary?: string;
  endedReason?: string;
  messages: CallMessage[];
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTime(ms: number, tz: string): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: tz,
  });
}

function callDuration(call: Call): string {
  if (!call.endedAt || !call.startedAt) return "";
  const secs = Math.round((call.endedAt - call.startedAt) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function guessCategory(messages: CallMessage[]): "Emergency" | "Scheduling" | "Service question" | "General" {
  const text = messages.filter(m => m.role !== "system").map(m => m.text).join(" ").toLowerCase();
  if (text.includes("leak") || text.includes("water") || text.includes("flood") || text.includes("emergency")) return "Emergency";
  if (text.includes("inspect") || text.includes("appointment") || text.includes("book") || text.includes("schedule")) return "Scheduling";
  if (text.includes("price") || text.includes("cost") || text.includes("quote") || text.includes("how much")) return "Service question";
  return "General";
}

const CATEGORY_STYLE: Record<string, string> = {
  Emergency: "tag urgent",
  Scheduling: "tag success",
  "Service question": "tag",
  General: "tag",
};

export default function CompanyCallsPage() {
  const businessId = useBusinessId();
  const tz = useBusinessTimezone();

  const [calls, setCalls] = useState<Call[]>([]);
  const [selected, setSelected] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirFilter, setDirFilter] = useState<"all" | "inbound" | "outbound">("all");

  useEffect(() => {
    if (!db || !businessId) return;
    getDocs(query(collection(db, `businesses/${businessId}/calls`), orderBy("startedAt", "desc")))
      .then((snap) => {
        const data = snap.docs.map((d) => ({ callId: d.id, ...d.data() } as Call));
        setCalls(data);
        if (data.length > 0) setSelected(data[0]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [businessId]);

  if (loading) return <div style={{ padding: 32, color: "#666" }}>Loading calls…</div>;

  const conversationMessages = (call: Call) =>
    (call.messages ?? []).filter((m) => m.role === "caller" || m.role === "agent");

  const filteredCalls = calls.filter((c) => {
    if (dirFilter === "inbound") return c.callType !== "outbound";
    if (dirFilter === "outbound") return c.callType === "outbound";
    return true;
  });

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Calls</h1>
          <p className="page-subtitle">
            Every call Alice answered — full transcript and AI summary.
          </p>
        </div>
        <span className="status-pill">{calls.length} total</span>
      </header>

      <div className="call-workspace">
        <section className="panel" aria-labelledby="call-list-title">
          <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="panel-title" id="call-list-title">Call History</h2>
            <div className="segmented-control" style={{ fontSize: 12 }}>
              {(["all", "inbound", "outbound"] as const).map((f) => (
                <button key={f} className="segment" type="button" aria-pressed={dirFilter === f} onClick={() => setDirFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="panel-body">
            {filteredCalls.length === 0 ? (
              <p style={{ color: "#888", fontSize: 14 }}>No calls yet. Calls appear here after Alice answers the phone.</p>
            ) : (
              <div className="call-list">
                {filteredCalls.map((call) => {
                  const msgs = conversationMessages(call);
                  const category = guessCategory(msgs);
                  const dur = callDuration(call);
                  const isOutbound = call.callType === "outbound";
                  const displayPhone = isOutbound ? (call.targetPhone ?? "Outbound") : (call.callerPhone ?? "Unknown caller");
                  return (
                    <article
                      className="call-row"
                      key={call.callId}
                      aria-selected={selected?.callId === call.callId}
                      onClick={() => setSelected(call)}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="call-row-header">
                        <div>
                          <p className="call-title">
                            {isOutbound && <span style={{ fontSize: 11, color: "#0f766e", fontWeight: 700, marginRight: 6 }}>→ OUT</span>}
                            {displayPhone}
                          </p>
                          <p className="call-subtitle">{formatTime(call.startedAt, tz)}</p>
                        </div>
                        <span className={CATEGORY_STYLE[category] ?? "tag"}>{category}</span>
                      </div>
                      <p className="call-subtitle">
                        {call.status}{dur ? ` · ${dur}` : ""} · {msgs.length} turns
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="call-detail-title">
          <div className="panel-header">
            <h2 className="panel-title" id="call-detail-title">Call Detail</h2>
          </div>
          <div className="panel-body">
            {!selected ? (
              <p style={{ color: "#888", fontSize: 14 }}>Select a call to view its transcript.</p>
            ) : (
              <>
                <div className="call-detail-meta">
                  <div>
                    <p className="call-detail-phone">{selected.callerPhone ?? "Unknown caller"}</p>
                    <p className="call-detail-sub">
                      {formatTime(selected.startedAt, tz)}
                      {callDuration(selected) ? ` · ${callDuration(selected)}` : ""}
                      {selected.endedReason ? ` · ${selected.endedReason}` : ""}
                    </p>
                  </div>
                </div>

                {selected.summary && (
                  <div className="summary-block">
                    <p style={{ fontWeight: 700, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px" }}>
                      AI Summary
                    </p>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{selected.summary}</p>
                  </div>
                )}

                {conversationMessages(selected).length === 0 ? (
                  <p style={{ color: "#888", fontSize: 14 }}>No transcript — call may have dropped or been a test.</p>
                ) : (
                  <div className="transcript" aria-label="Call transcript">
                    {conversationMessages(selected).map((msg, i) => (
                      <article
                        className={msg.role === "agent" ? "message agent" : "message"}
                        key={i}
                      >
                        <p className="message-role">{msg.role === "agent" ? "Alice" : "Caller"}</p>
                        <p className="message-text">{msg.text}</p>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

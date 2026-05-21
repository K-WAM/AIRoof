"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/contexts/AuthContext";

interface CallMessage {
  role: "caller" | "agent";
  text: string;
  timestamp: number;
}

interface Call {
  callId: string;
  callerPhone?: string;
  status: string;
  startedAt: number;
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

function guessCategory(messages: CallMessage[]): string {
  const text = messages.map((m) => m.text).join(" ").toLowerCase();
  if (text.includes("leak") || text.includes("water") || text.includes("flood")) return "Emergency";
  if (text.includes("inspect") || text.includes("appointment") || text.includes("book")) return "Scheduling";
  if (text.includes("price") || text.includes("cost") || text.includes("quote")) return "Service question";
  return "General";
}

export default function CompanyCallsPage() {
  const { user } = useAuth();
  const businessId = user?.businessId ?? "demo-roofing";

  const [calls, setCalls] = useState<Call[]>([]);
  const [selected, setSelected] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Calls</h1>
          <p className="page-subtitle">
            Review call transcripts and the actions Roofus took for each roofing inquiry.
          </p>
        </div>
        <span className="status-pill">{calls.length} total</span>
      </header>

      <div className="call-workspace">
        <section className="panel" aria-labelledby="call-list-title">
          <div className="panel-header">
            <h2 className="panel-title" id="call-list-title">Call History</h2>
          </div>
          <div className="panel-body">
            {calls.length === 0 ? (
              <p style={{ color: "#888", fontSize: 14 }}>No calls yet. Calls appear here after Roofus answers the phone.</p>
            ) : (
              <div className="call-list">
                {calls.map((call) => {
                  const category = guessCategory(call.messages ?? []);
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
                          <p className="call-title">{call.callerPhone ?? "Unknown caller"}</p>
                          <p className="call-subtitle">{call.callId}</p>
                        </div>
                        <span className={category === "Emergency" ? "tag urgent" : "tag"}>
                          {category}
                        </span>
                      </div>
                      <p className="call-subtitle">
                        {call.status} · {timeAgo(call.startedAt)}
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
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontWeight: 600 }}>{selected.callerPhone ?? "Unknown caller"}</p>
                  <p style={{ color: "#888", fontSize: 13 }}>{timeAgo(selected.startedAt)} · {selected.status}</p>
                </div>

                {(!selected.messages || selected.messages.length === 0) ? (
                  <p style={{ color: "#888", fontSize: 14 }}>No transcript — call may have been a drop or system test.</p>
                ) : (
                  <div className="transcript" aria-label="Call transcript">
                    {selected.messages.map((msg, i) => (
                      <article
                        className={msg.role === "agent" ? "message agent" : "message"}
                        key={i}
                      >
                        <p className="message-role">{msg.role === "agent" ? "Roofus" : "Caller"}</p>
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

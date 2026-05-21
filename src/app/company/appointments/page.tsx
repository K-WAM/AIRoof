"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Appointment {
  appointmentId: string;
  callerName?: string;
  callerPhone?: string;
  serviceType?: string;
  address?: string;
  startTime: number;
  endTime: number;
  status: string;
  createdAt: number;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export default function CompanyAppointmentsPage() {
  const { user } = useAuth();
  const businessId = user?.businessId ?? "demo-roofing";

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !businessId) return;
    getDocs(query(collection(db, `businesses/${businessId}/appointments`), orderBy("startTime", "asc")))
      .then((snap) => {
        setAppointments(snap.docs.map((d) => ({ appointmentId: d.id, ...d.data() } as Appointment)));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [businessId]);

  async function updateStatus(appt: Appointment, status: string) {
    if (!db) return;
    setUpdating(appt.appointmentId);
    try {
      await updateDoc(doc(db, `businesses/${businessId}/appointments`, appt.appointmentId), {
        status,
        updatedAt: Date.now(),
      });
      setAppointments((prev) =>
        prev.map((a) => (a.appointmentId === appt.appointmentId ? { ...a, status } : a))
      );
    } finally {
      setUpdating(null);
    }
  }

  const upcoming = appointments.filter((a) => a.startTime > Date.now() && a.status !== "cancelled");
  const past = appointments.filter((a) => a.startTime <= Date.now());

  if (loading) return <div style={{ padding: 32, color: "#666" }}>Loading appointments…</div>;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Appointments</h1>
          <p className="page-subtitle">
            Track inspection bookings created from AI-qualified calls.
          </p>
        </div>
        <span className="status-pill">{upcoming.length} upcoming</span>
      </header>

      <section className="panel" aria-labelledby="upcoming-title">
        <div className="panel-header">
          <h2 className="panel-title" id="upcoming-title">Upcoming Inspections</h2>
        </div>
        <div className="panel-body">
          {upcoming.length === 0 ? (
            <p style={{ color: "#888", fontSize: 14 }}>No upcoming appointments. They appear here when Roofus books one.</p>
          ) : (
            <div className="appointment-list">
              {upcoming.map((appt) => (
                <article className="appointment-card" key={appt.appointmentId}>
                  <div className="appointment-time">
                    <span className="time-main">{formatTime(appt.startTime)}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p className="appointment-title">{appt.callerName ?? "Unknown"}</p>
                    <p className="appointment-meta">{appt.callerPhone ?? "—"}</p>
                    <p className="appointment-meta">{appt.serviceType ?? "Service not specified"}</p>
                    <p className="appointment-meta">{appt.address ?? "No address"}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                    <span className={appt.status === "requested" ? "tag" : "tag success"}>
                      {appt.status}
                    </span>
                    {appt.status !== "confirmed" && appt.status !== "cancelled" && (
                      <button
                        className="button primary"
                        type="button"
                        disabled={updating === appt.appointmentId}
                        onClick={() => updateStatus(appt, "confirmed")}
                        style={{ fontSize: 12, padding: "4px 10px" }}
                      >
                        Confirm
                      </button>
                    )}
                    {appt.status !== "cancelled" && (
                      <button
                        className="button"
                        type="button"
                        disabled={updating === appt.appointmentId}
                        onClick={() => updateStatus(appt, "cancelled")}
                        style={{ fontSize: 12, padding: "4px 10px" }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {past.length > 0 && (
        <section className="panel" aria-labelledby="past-title" style={{ marginTop: 20 }}>
          <div className="panel-header">
            <h2 className="panel-title" id="past-title">Past</h2>
          </div>
          <div className="panel-body">
            <div className="appointment-list">
              {past.map((appt) => (
                <article className="appointment-card" key={appt.appointmentId}>
                  <div className="appointment-time">
                    <span className="time-main">{formatTime(appt.startTime)}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p className="appointment-title">{appt.callerName ?? "Unknown"}</p>
                    <p className="appointment-meta">{appt.serviceType ?? "—"}</p>
                    <p className="appointment-meta">{appt.address ?? "—"}</p>
                  </div>
                  <span className="tag">{appt.status}</span>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

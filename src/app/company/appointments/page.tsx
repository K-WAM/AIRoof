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
  sourceCallId?: string;
}

function formatApptDate(ms: number): { day: string; date: string; time: string } {
  const d = new Date(ms);
  return {
    day: d.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" }),
    date: d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }),
  };
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

const STATUS_CLASS: Record<string, string> = {
  confirmed: "tag success",
  cancelled: "tag urgent",
  requested: "tag",
};

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
        status, updatedAt: Date.now(),
      });
      setAppointments((prev) =>
        prev.map((a) => (a.appointmentId === appt.appointmentId ? { ...a, status } : a))
      );
    } finally {
      setUpdating(null);
    }
  }

  async function sendConfirmation(appt: Appointment) {
    setUpdating(appt.appointmentId + "_confirm");
    try {
      const res = await fetch("/api/appointments/send-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, appointmentId: appt.appointmentId }),
      });
      if (res.ok) {
        setAppointments((prev) =>
          prev.map((a) => (a.appointmentId === appt.appointmentId ? { ...a, status: "confirmed" } : a))
        );
      }
    } finally {
      setUpdating(null);
    }
  }

  const upcoming = appointments.filter((a) => a.startTime > Date.now() && a.status !== "cancelled");
  const past = appointments.filter((a) => a.startTime <= Date.now() || a.status === "cancelled");

  if (loading) return <div style={{ padding: 32, color: "#666" }}>Loading appointments…</div>;

  function AppointmentCard({ appt, isPast }: { appt: Appointment; isPast?: boolean }) {
    const { day, date, time } = formatApptDate(appt.startTime);
    const busy = updating === appt.appointmentId || updating === appt.appointmentId + "_confirm";
    return (
      <article className="appt-card" style={{ opacity: isPast ? 0.75 : 1 }}>
        <div className="appt-date-block">
          <span className="appt-day">{day}</span>
          <span className="appt-date">{date}</span>
          <span className="appt-time">{time} ET</span>
          <span className="appt-booked-at">Booked {timeAgo(appt.createdAt)}</span>
        </div>

        <div className="appt-body">
          <div className="appt-name-row">
            <span className="appt-name">{appt.callerName ?? "Unknown caller"}</span>
            <span className={STATUS_CLASS[appt.status] ?? "tag"}>{appt.status}</span>
          </div>
          <p className="appt-detail">{appt.callerPhone ?? "—"}</p>
          <p className="appt-detail">{appt.serviceType ?? "Service not specified"}</p>
          <p className="appt-detail">{appt.address ?? "No address provided"}</p>
        </div>

        {!isPast && (
          <div className="appt-actions">
            {appt.status !== "confirmed" && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => sendConfirmation(appt)}
                style={{ fontSize: 13 }}
              >
                {updating === appt.appointmentId + "_confirm" ? "Sending…" : "Send Confirmation"}
              </button>
            )}
            {appt.status !== "confirmed" && appt.status !== "cancelled" && (
              <button
                className="button"
                disabled={busy}
                onClick={() => updateStatus(appt, "confirmed")}
                style={{ fontSize: 13 }}
              >
                Mark Confirmed
              </button>
            )}
            {appt.status !== "cancelled" && (
              <button
                className="button"
                disabled={busy}
                onClick={() => updateStatus(appt, "cancelled")}
                style={{ fontSize: 13, color: "#b91c1c" }}
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </article>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Appointments</h1>
          <p className="page-subtitle">
            Inspection bookings captured by Alice from incoming calls.
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
            <p style={{ color: "#888", fontSize: 14 }}>No upcoming appointments. They appear here when Alice books one.</p>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {upcoming.map((appt) => <AppointmentCard key={appt.appointmentId} appt={appt} />)}
            </div>
          )}
        </div>
      </section>

      {past.length > 0 && (
        <section className="panel" aria-labelledby="past-title" style={{ marginTop: 20 }}>
          <div className="panel-header">
            <h2 className="panel-title" id="past-title">Past &amp; Cancelled</h2>
          </div>
          <div className="panel-body">
            <div style={{ display: "grid", gap: 16 }}>
              {past.map((appt) => <AppointmentCard key={appt.appointmentId} appt={appt} isPast />)}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

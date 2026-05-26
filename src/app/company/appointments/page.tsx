"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { collection, getDocs, query, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";

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

function formatApptDate(ms: number, tz: string): { day: string; date: string; time: string } {
  const d = new Date(ms);
  return {
    day: d.toLocaleDateString("en-US", { weekday: "long", timeZone: tz }),
    date: d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: tz }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }),
  };
}

function formatCallTime(ms: number, tz: string): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: tz,
  });
}

const STATUS_CLASS: Record<string, string> = {
  confirmed: "tag success",
  cancelled: "tag urgent",
  requested: "tag",
};

export default function CompanyAppointmentsPage() {
  const businessId = useBusinessId();
  const tz = useBusinessTimezone();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [confirmedSet, setConfirmedSet] = useState<Set<string>>(new Set());

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

  function createJob(appt: Appointment) {
    const params = new URLSearchParams({
      clientName: appt.callerName ?? "",
      clientPhone: appt.callerPhone ?? "",
      address: appt.address ?? "",
      serviceType: appt.serviceType ?? "",
      appointmentId: appt.appointmentId,
    });
    if (preview) params.set("preview", preview);
    window.location.href = `/company/jobs?${params.toString()}#new`;
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
        setConfirmedSet((prev) => new Set(prev).add(appt.appointmentId));
        setAppointments((prev) =>
          prev.map((a) => (a.appointmentId === appt.appointmentId ? { ...a, status: "confirmed" } : a))
        );
        setTimeout(() => {
          setConfirmedSet((prev) => {
            const next = new Set(prev);
            next.delete(appt.appointmentId);
            return next;
          });
        }, 3000);
      }
    } finally {
      setUpdating(null);
    }
  }

  const upcoming = appointments.filter((a) => a.startTime > Date.now() && a.status !== "cancelled");
  const past = appointments.filter((a) => a.startTime <= Date.now() || a.status === "cancelled");

  if (loading) return <div style={{ padding: 32, color: "#666" }}>Loading appointments…</div>;

  function AppointmentCard({ appt, isPast }: { appt: Appointment; isPast?: boolean }) {
    const { day, date, time } = formatApptDate(appt.startTime, tz);
    const busy = updating === appt.appointmentId || updating === appt.appointmentId + "_confirm";
    const justConfirmed = confirmedSet.has(appt.appointmentId);
    const isConfirmed = appt.status === "confirmed" || justConfirmed;

    return (
      <article className="appt-card" style={{ opacity: isPast ? 0.75 : 1 }}>
        <div className="appt-date-block">
          <span className="appt-day">Appt. {day}</span>
          <span className="appt-date">{date}</span>
          <span className="appt-time">{time}</span>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
            <span className="appt-booked-at" style={{ display: "block", marginBottom: 2, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>Call received</span>
            <span className="appt-booked-at">{formatCallTime(appt.createdAt, tz)}</span>
          </div>
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

        <div className="appt-actions">
          <button
            className="button"
            onClick={() => createJob(appt)}
            style={{ fontSize: 12, marginBottom: 8 }}
          >
            Create Job →
          </button>
          {justConfirmed ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#15803d", fontWeight: 700, fontSize: 13 }}>
              <span>✓</span> Confirmation sent
            </div>
          ) : !isPast && !isConfirmed ? (
            <>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => sendConfirmation(appt)}
                style={{ fontSize: 13 }}
              >
                {updating === appt.appointmentId + "_confirm" ? "Sending…" : "Send Confirmation"}
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => updateStatus(appt, "confirmed")}
                style={{ fontSize: 13 }}
              >
                Mark Confirmed
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => updateStatus(appt, "cancelled")}
                style={{ fontSize: 13, color: "#b91c1c" }}
              >
                Cancel
              </button>
            </>
          ) : isConfirmed && !isPast ? (
            <button
              className="button"
              disabled={busy}
              onClick={() => updateStatus(appt, "cancelled")}
              style={{ fontSize: 13, color: "#b91c1c" }}
            >
              Cancel
            </button>
          ) : null}
        </div>
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

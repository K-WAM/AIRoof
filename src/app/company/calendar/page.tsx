"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";
import { useSearchParams } from "next/navigation";
import type { Job } from "@/types/jobs";

interface Appointment {
  appointmentId: string;
  callerName?: string;
  serviceType?: string;
  address?: string;
  startTime: number;
  status: string;
}

interface CalEvent {
  id: string;
  type: "appointment" | "job";
  label: string;
  sublabel?: string;
  color: string;
  bgColor: string;
  dateKey: string; // YYYY-MM-DD
  raw: Appointment | Job;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function toDateKey(ms: number, tz: string): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: tz });
}

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: (Date | null)[][] = [];
  let week: (Date | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) { grid.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    grid.push(week);
  }
  return grid;
}

function fmtTime(ms: number, tz: string): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}

function fmtDate(ms: number, tz: string): string {
  return new Date(ms).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz });
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    confirmed: { bg: "#dcfce7", text: "#16a34a" },
    open: { bg: "#dbeafe", text: "#1d4ed8" },
    in_progress: { bg: "#fef3c7", text: "#d97706" },
    complete: { bg: "#f1f5f9", text: "#64748b" },
    cancelled: { bg: "#fee2e2", text: "#b91c1c" },
    requested: { bg: "#f0f9ff", text: "#0369a1" },
  };
  const c = colors[status] ?? colors.requested;
  return (
    <span style={{ background: c.bg, color: c.text, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, textTransform: "capitalize" }}>
      {status.replace("_", " ")}
    </span>
  );
}

export default function CalendarPage() {
  const businessId = useBusinessId();
  const tz = useBusinessTimezone();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const todayKey = toDateKey(Date.now(), tz);

  useEffect(() => {
    if (!businessId) return;
    const biz = businessId;

    async function load() {
      try {
        if (!db) return;
        // Fetch prev month start → next month end so navigation feels instant
        const startMs = new Date(year, month - 1, 1).getTime();
        const endMs = new Date(year, month + 2, 0, 23, 59, 59, 999).getTime();

        const [apptSnap, jobsRes] = await Promise.all([
          getDocs(query(
            collection(db, "businesses", biz, "appointments"),
            where("startTime", ">=", startMs),
            where("startTime", "<=", endMs),
            orderBy("startTime", "asc")
          )),
          fetch(`/api/jobs?businessId=${biz}`).then(r => r.json()),
        ]);

        const appts: CalEvent[] = apptSnap.docs.map(d => {
          const a = { appointmentId: d.id, ...d.data() } as Appointment;
          return {
            id: a.appointmentId,
            type: "appointment",
            label: a.callerName ?? "Inspection",
            sublabel: a.serviceType ?? a.address,
            color: "#1d4ed8",
            bgColor: "#dbeafe",
            dateKey: toDateKey(a.startTime, tz),
            raw: a,
          } as CalEvent;
        });

        const jobEvts: CalEvent[] = ((jobsRes.jobs ?? []) as Job[]).filter(j => j.status !== "complete").map(j => ({
          id: j.jobId,
          type: "job",
          label: j.jobId,
          sublabel: j.title,
          color: "#b45309",
          bgColor: "#fef3c7",
          dateKey: toDateKey(j.createdAt, tz),
          raw: j,
        }));

        setEvents([...appts, ...jobEvts]);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }

    load();
  }, [businessId, tz, year, month]);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedKey(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedKey(null);
  }

  const grid = getMonthGrid(year, month);
  const eventsByDay = events.reduce<Record<string, CalEvent[]>>((acc, e) => {
    (acc[e.dateKey] ??= []).push(e);
    return acc;
  }, {});

  const selectedEvents = selectedKey ? (eventsByDay[selectedKey] ?? []) : [];

  return (
    <div style={{ padding: "24px 20px", maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <button onClick={prevMonth} style={{ width: 36, height: 36, border: "1.5px solid #e2e8f0", borderRadius: "50%", background: "#fff", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#1e293b" }}>‹</button>
        <h2 style={{ margin: 0, fontWeight: 700, fontSize: 20, color: "#0f172a", letterSpacing: "-0.02em" }}>
          {MONTHS[month]} {year}
        </h2>
        <button onClick={nextMonth} style={{ width: 36, height: 36, border: "1.5px solid #e2e8f0", borderRadius: "50%", background: "#fff", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#1e293b" }}>›</button>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6" }} />
          <span style={{ fontSize: 12, color: "#64748b" }}>Appointment</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
          <span style={{ fontSize: 12, color: "#64748b" }}>Job</span>
        </div>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "#94a3b8", padding: "8px 0", letterSpacing: "0.05em" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading calendar…</div>
      ) : (
        <div style={{ border: "1px solid #f1f5f9", borderRadius: 16, overflow: "hidden" }}>
          {grid.map((week, wi) => (
            <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: wi < grid.length - 1 ? "1px solid #f1f5f9" : "none" }}>
              {week.map((day, di) => {
                if (!day) return <div key={di} style={{ minHeight: 100, background: "#fafafa", borderRight: di < 6 ? "1px solid #f1f5f9" : "none" }} />;

                const key = toDateKey(day.getTime(), tz);
                const dayEvents = eventsByDay[key] ?? [];
                const isToday = key === todayKey;
                const isSelected = key === selectedKey;
                const isCurrentMonth = day.getMonth() === month;
                const preview2 = dayEvents.slice(0, 3);
                const overflow = dayEvents.length - 3;

                return (
                  <div
                    key={di}
                    onClick={() => setSelectedKey(isSelected ? null : key)}
                    style={{
                      minHeight: 100, padding: "8px 6px",
                      borderRight: di < 6 ? "1px solid #f1f5f9" : "none",
                      background: isSelected ? "#f0f9ff" : "#fff",
                      cursor: "pointer",
                      transition: "background 0.1s",
                      opacity: isCurrentMonth ? 1 : 0.35,
                    }}
                  >
                    {/* Day number */}
                    <div style={{ marginBottom: 4 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 28, height: 28, borderRadius: "50%",
                        background: isToday ? "#0f172a" : "transparent",
                        color: isToday ? "#fff" : "#1e293b",
                        fontSize: 13, fontWeight: isToday ? 700 : 400,
                      }}>
                        {day.getDate()}
                      </span>
                    </div>

                    {/* Event pills */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {preview2.map(e => (
                        <div key={e.id} style={{
                          background: e.bgColor, color: e.color,
                          fontSize: 10, fontWeight: 600, padding: "2px 6px",
                          borderRadius: 4, whiteSpace: "nowrap", overflow: "hidden",
                          textOverflow: "ellipsis", lineHeight: 1.4,
                        }}>
                          {e.label}
                        </div>
                      ))}
                      {overflow > 0 && (
                        <div style={{ fontSize: 10, color: "#94a3b8", padding: "1px 6px" }}>+{overflow} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Day detail panel */}
      {selectedKey && (
        <div style={{ marginTop: 20, border: "1.5px solid #e2e8f0", borderRadius: 16, overflow: "hidden", background: "#fff" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: "#0f172a" }}>
                {new Date(selectedKey + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
                {selectedEvents.length === 0 ? "No events" : `${selectedEvents.length} event${selectedEvents.length > 1 ? "s" : ""}`}
              </p>
            </div>
            <button onClick={() => setSelectedKey(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "#94a3b8", fontSize: 20, lineHeight: 1 }}>×</button>
          </div>

          {selectedEvents.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
              No appointments or jobs scheduled for this day.
            </div>
          ) : (
            <div style={{ padding: "8px 0" }}>
              {selectedEvents.map(e => {
                const isAppt = e.type === "appointment";
                const appt = isAppt ? e.raw as Appointment : null;
                const job = !isAppt ? e.raw as Job : null;

                return (
                  <div key={e.id} style={{ padding: "12px 20px", borderBottom: "1px solid #f8fafc", display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: e.bgColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                      {isAppt ? "📅" : "🔨"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{e.label}</span>
                        <StatusPill status={isAppt ? appt!.status : job!.status} />
                      </div>
                      {e.sublabel && <p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748b" }}>{e.sublabel}</p>}
                      {isAppt && appt && (
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>
                          {fmtTime(appt.startTime, tz)} · {appt.address ?? ""}
                        </p>
                      )}
                      {!isAppt && job && (
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>
                          {job.address ?? ""}{job.clientName ? ` · ${job.clientName}` : ""}
                        </p>
                      )}
                    </div>
                    {isAppt && (
                      <a
                        href={`/company/appointments${preview ? `?preview=${preview}` : ""}`}
                        style={{ fontSize: 12, color: "#3b82f6", textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" }}
                      >
                        View →
                      </a>
                    )}
                    {!isAppt && (
                      <a
                        href={`/company/jobs/${(e.raw as Job).jobId}${preview ? `?preview=${preview}` : ""}`}
                        style={{ fontSize: 12, color: "#3b82f6", textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" }}
                      >
                        View →
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

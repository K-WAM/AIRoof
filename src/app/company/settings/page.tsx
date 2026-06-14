"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { SUPPORTED_TIMEZONES } from "@/hooks/useBusinessTimezone";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DEFAULT_HOURS: Record<string, string> = {
  Monday: "08:00 - 17:00",
  Tuesday: "08:00 - 17:00",
  Wednesday: "08:00 - 17:00",
  Thursday: "08:00 - 17:00",
  Friday: "08:00 - 17:00",
  Saturday: "09:00 - 13:00",
  Sunday: "Closed",
};

interface Settings {
  timezone: string;
  businessHours: Record<string, string>;
  notificationEmail: string;
  contactPhone: string;
  contactEmail: string;
  businessName: string;
}

export default function CompanySettingsPage() {
  const businessId = useBusinessId();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");

  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/company/settings?businessId=${businessId}`)
      .then(r => r.json())
      .then(d => setSettings(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [businessId]);

  if (loading) return <div style={{ padding: 32, color: "#666" }}>Loading settings…</div>;
  if (!settings) return <div style={{ padding: 32, color: "#b91c1c" }}>Could not load settings.</div>;

  function setHours(day: string, value: string) {
    setSettings(prev => prev ? { ...prev, businessHours: { ...prev.businessHours, [day]: value } } : prev);
  }

  function toggleClosed(day: string, closed: boolean) {
    setHours(day, closed ? "Closed" : (DEFAULT_HOURS[day] ?? "09:00 - 17:00"));
  }

  async function save() {
    if (!businessId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/company/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, ...settings }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Save failed");
      }
      setSaved(true);
      // Clear timezone cache so next nav picks up new value
      try { sessionStorage.removeItem(`tz_${businessId}`); } catch {}
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const previewSuffix = preview ? `?preview=${preview}` : "";

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Business hours, timezone, and contact details. Changes take effect immediately.</p>
        </div>
        <button className="button primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </header>

      {saved && (
        <div style={{ padding: "10px 16px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, marginBottom: 16, fontSize: 14, color: "#15803d", fontWeight: 600 }}>
          ✓ Settings saved successfully.
        </div>
      )}
      {error && (
        <div style={{ padding: "10px 16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, marginBottom: 16, fontSize: 14, color: "#b91c1c" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>
        {/* Business hours */}
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Business Hours</h2>
          </div>
          <div className="panel-body">
            <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>
              Your AI receptionist uses these hours to tag after-hours calls. She can still book appointments 24/7 — calls outside these hours are flagged for your awareness.
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              {DAYS.map((day) => {
                const val = settings.businessHours[day] ?? "Closed";
                const isClosed = val.toLowerCase() === "closed";
                const parts = val.match(/^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$/);
                const open = parts ? parts[1] : "09:00";
                const close = parts ? parts[2] : "17:00";

                return (
                  <div key={day} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
                    <span style={{ width: 90, fontWeight: 600, fontSize: 13, color: "#1e293b" }}>{day}</span>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "#64748b" }}>
                      <input
                        type="checkbox"
                        checked={isClosed}
                        onChange={e => toggleClosed(day, e.target.checked)}
                      />
                      Closed
                    </label>
                    {!isClosed && (
                      <>
                        <input
                          type="time"
                          value={open}
                          onChange={e => setHours(day, `${e.target.value} - ${close}`)}
                          style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }}
                        />
                        <span style={{ color: "#94a3b8", fontSize: 13 }}>to</span>
                        <input
                          type="time"
                          value={close}
                          onChange={e => setHours(day, `${open} - ${e.target.value}`)}
                          style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }}
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Timezone + Contact */}
        <div style={{ display: "grid", gap: 20 }}>
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Timezone</h2>
            </div>
            <div className="panel-body">
              <div className="field">
                <label htmlFor="tz">Your business timezone</label>
                <select
                  id="tz"
                  value={settings.timezone}
                  onChange={e => setSettings(prev => prev ? { ...prev, timezone: e.target.value } : prev)}
                >
                  {SUPPORTED_TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Notifications &amp; Contact</h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field full">
                  <label htmlFor="notifEmail">Notification email</label>
                  <input
                    id="notifEmail"
                    type="email"
                    value={settings.notificationEmail}
                    onChange={e => setSettings(prev => prev ? { ...prev, notificationEmail: e.target.value } : prev)}
                    placeholder="alerts@yourcompany.com"
                  />
                  <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0 0" }}>Receives booking + lead notifications from Alice.</p>
                </div>
                <div className="field full">
                  <label htmlFor="contactPhone">Public contact phone</label>
                  <input
                    id="contactPhone"
                    type="tel"
                    value={settings.contactPhone}
                    onChange={e => setSettings(prev => prev ? { ...prev, contactPhone: e.target.value } : prev)}
                    placeholder="+1 (305) 555-0100"
                  />
                </div>
                <div className="field full">
                  <label htmlFor="contactEmail">Public contact email</label>
                  <input
                    id="contactEmail"
                    type="email"
                    value={settings.contactEmail}
                    onChange={e => setSettings(prev => prev ? { ...prev, contactEmail: e.target.value } : prev)}
                    placeholder="hello@yourcompany.com"
                  />
                </div>
              </div>
            </div>
          </section>

          <div style={{ padding: "12px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, color: "#64748b" }}>
            <p style={{ margin: 0, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Need to change other settings?</p>
            <p style={{ margin: 0 }}>For services, FAQs, agent voice, or Vapi config — contact your Luxor account manager at connect@luxordev.com.</p>
          </div>
        </div>
      </div>
    </>
  );
}

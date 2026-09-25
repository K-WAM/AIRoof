"use client";

import { useEffect, useRef, useState } from "react";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useAuth } from "@/contexts/AuthContext";
import { SUPPORTED_TIMEZONES } from "@/hooks/useBusinessTimezone";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import { Toggle } from "@/components/ui/Toggle";
import { TeamPanel } from "./TeamPanel";
import {
  composeGreetingWithDisclosure,
  defaultRecordingDisclosureText,
  RECORDING_DISCLOSURE_MAX_LENGTH,
} from "@/lib/recordingDisclosure";
import { Bell, Clock3, Globe2, Languages, Mic, Save, Settings } from "lucide-react";

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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s().-]{7,20}$/;

interface Settings {
  timezone: string;
  businessHours: Record<string, string>;
  notificationEmail: string;
  contactPhone: string;
  contactEmail: string;
  licenseNumber: string;
  businessName: string;
  agentLanguage: "en" | "es";
  // Call-recording notice (Phase 16, T-102) — optional so an older cached
  // response can never crash this page.
  greeting?: string;
  afterHoursGreeting?: string;
  recordingDisclosure?: { enabled: boolean; text: string };
}

export default function CompanySettingsPage() {
  const businessId = useBusinessId();
  const { user } = useAuth();
  const canManageTeam = user?.role === "owner" || !!user?.superadmin;

  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const notificationEmailRef = useRef<HTMLInputElement>(null);
  const contactPhoneRef = useRef<HTMLInputElement>(null);
  const contactEmailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/company/settings?businessId=${businessId}`)
      .then(r => {
        if (!r.ok) throw new Error("Settings request failed");
        return r.json();
      })
      .then(d => setSettings(d))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [businessId]);

  if (loading) return <PageSkeleton rows={5} />;
  if (loadError || !settings) {
    return (
      <PageError
        message="Settings could not be loaded. No saved configuration is being shown."
        onRetry={() => window.location.reload()}
      />
    );
  }

  function setHours(day: string, value: string) {
    setSettings(prev => prev ? { ...prev, businessHours: { ...prev.businessHours, [day]: value } } : prev);
  }

  function toggleClosed(day: string, closed: boolean) {
    setHours(day, closed ? "Closed" : (DEFAULT_HOURS[day] ?? "09:00 - 17:00"));
  }

  async function save() {
    if (!businessId || !settings) return;
    const notificationEmail = settings.notificationEmail.trim();
    const contactPhone = settings.contactPhone.trim();
    const contactEmail = settings.contactEmail.trim();
    if (settings.licenseNumber.length > 40 || /[<>\u0000-\u001f]/.test(settings.licenseNumber)) {
      setError("Enter a plain-text license number of 40 characters or fewer.");
      return;
    }
    if (!notificationEmail || !EMAIL_PATTERN.test(notificationEmail)) {
      setError("Enter a valid notification email before saving.");
      notificationEmailRef.current?.focus();
      return;
    }
    if (!contactPhone || !PHONE_PATTERN.test(contactPhone)) {
      setError("Enter a valid public contact phone before saving.");
      contactPhoneRef.current?.focus();
      return;
    }
    if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
      setError("Enter a valid public contact email before saving.");
      contactEmailRef.current?.focus();
      return;
    }
    const disclosureText = settings.recordingDisclosure?.text ?? "";
    if (disclosureText.trim().length > RECORDING_DISCLOSURE_MAX_LENGTH) {
      setError(`The recording notice must be ${RECORDING_DISCLOSURE_MAX_LENGTH} characters or fewer.`);
      return;
    }
    if (/<[a-z][^>]*>/i.test(disclosureText)) {
      setError("The recording notice must be plain text — no HTML or markup.");
      return;
    }
    setSaving(true);
    setError(null);
    setWarning(null);
    try {
      // Staff may save the other settings but not the recording notice (owner/superadmin
      // only server-side) — never send it from a non-owner session.
      const payload: Record<string, unknown> = {
        businessId,
        timezone: settings.timezone,
        businessHours: settings.businessHours,
        notificationEmail: settings.notificationEmail,
        contactPhone: settings.contactPhone,
        contactEmail: settings.contactEmail,
        licenseNumber: settings.licenseNumber,
        agentLanguage: settings.agentLanguage,
        agentLanguages: [settings.agentLanguage],
      };
      if (canManageTeam) payload.recordingDisclosure = settings.recordingDisclosure;
      const res = await fetch("/api/company/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error("Settings save failed");
      }
      setSaved(true);
      if (data.vapiSyncWarning) setWarning(data.vapiSyncWarning);
      // Clear timezone cache so next nav picks up new value
      try { sessionStorage.removeItem(`tz_${businessId}`); } catch {}
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Settings could not be saved. Review the form and try again.");
    } finally {
      setSaving(false);
    }
  }

  const disclosure = settings.recordingDisclosure ?? { enabled: true, text: "" };
  const disclosureDraft = {
    enabled: disclosure.enabled,
    text: disclosure.text.trim() || defaultRecordingDisclosureText(settings.agentLanguage),
  };
  const previewGreeting = composeGreetingWithDisclosure(settings.greeting ?? "", disclosureDraft);
  const previewAfterHours = composeGreetingWithDisclosure(settings.afterHoursGreeting ?? "", disclosureDraft);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Settings size={20} strokeWidth={1.75} />
            Settings
          </h1>
          <p className="page-subtitle">Business hours, timezone, and contact details. Changes take effect immediately.</p>
        </div>
        <button className="button primary" onClick={save} disabled={saving} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Save size={15} strokeWidth={1.75} />
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </header>

      {saved && (
        <div style={{ padding: "10px 16px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, marginBottom: 16, fontSize: 14, color: "#15803d", fontWeight: 600 }}>
          ✓ Settings saved successfully.
        </div>
      )}
      {warning && (
        <div role="status" style={{ padding: "10px 16px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, marginBottom: 16, fontSize: 14, color: "#92400e" }}>
          {warning}
        </div>
      )}
      {error && (
        <div role="alert" style={{ padding: "10px 16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, marginBottom: 16, fontSize: 14, color: "#b91c1c" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 20 }}>
        {/* Business hours */}
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Clock3 size={16} strokeWidth={1.75} />
              Business Hours
            </h2>
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#64748b" }}>
                      <Toggle checked={isClosed} onChange={(next) => toggleClosed(day, next)} label={`${day} closed`} size="sm" />
                      Closed
                    </div>
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

        {/* Call recording notice — owner/superadmin only */}
        {canManageTeam && (
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Mic size={16} strokeWidth={1.75} />
                Call Recording Notice
              </h2>
            </div>
            <div className="panel-body">
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px" }}>
                In Florida and several other states, every party on a call must be told it may be
                recorded. When this is on, the notice below is spoken as one short sentence at the
                start of every greeting.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#1e293b", fontWeight: 600, marginBottom: 12 }}>
                <Toggle
                  checked={disclosure.enabled}
                  onChange={(next) => setSettings(prev => prev ? { ...prev, recordingDisclosure: { ...disclosure, enabled: next } } : prev)}
                  label="Speak the recording notice on every call"
                />
                Speak the notice at the start of every call
              </div>
              {disclosure.enabled && (
                <>
                  <div className="field">
                    <label htmlFor="recordingText">Spoken notice</label>
                    <textarea
                      id="recordingText"
                      rows={3}
                      maxLength={RECORDING_DISCLOSURE_MAX_LENGTH}
                      value={disclosure.text}
                      onChange={e => setSettings(prev => prev ? { ...prev, recordingDisclosure: { ...disclosure, text: e.target.value } } : prev)}
                      placeholder={defaultRecordingDisclosureText(settings.agentLanguage)}
                      style={{ resize: "vertical" }}
                    />
                    <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0 0" }}>
                      {disclosure.text.length}/{RECORDING_DISCLOSURE_MAX_LENGTH} characters.
                      {disclosure.text.trim().length === 0
                        ? ` If left blank, the default "${defaultRecordingDisclosureText(settings.agentLanguage)}" is spoken.`
                        : ""}
                    </p>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>Live preview — what callers hear first</p>
                    <div style={{ padding: "10px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, color: "#334155", lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 600, color: "#0f766e", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.4px" }}>Business hours</span>
                      <p style={{ margin: "4px 0 0" }}>{previewGreeting}</p>
                    </div>
                    <div style={{ padding: "10px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, color: "#334155", lineHeight: 1.5, marginTop: 8 }}>
                      <span style={{ fontWeight: 600, color: "#0f766e", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.4px" }}>After hours</span>
                      <p style={{ margin: "4px 0 0" }}>{previewAfterHours}</p>
                    </div>
                  </div>
                </>
              )}
              <p style={{ fontSize: 12, color: "#64748b", margin: "12px 0 0", padding: "10px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                The default wording is a <strong>draft, not legal advice</strong>. Recording-consent
                requirements vary by state — have counsel review this wording before you rely on it.
              </p>
            </div>
          </section>
        )}
        </div>

        {/* Timezone + Contact */}
        <div style={{ display: "grid", gap: 20 }}>
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Globe2 size={16} strokeWidth={1.75} />
                Timezone
              </h2>
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
              <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Languages size={16} strokeWidth={1.75} />
                Phone AI Language
              </h2>
            </div>
            <div className="panel-body">
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px" }}>
                Switches immediately on save — the next call greets in this language. Field voice
                updates always understand English and Spanish automatically, regardless of this setting.
              </p>
              <div className="segmented-control" aria-label="Phone AI language" style={{ maxWidth: 260 }}>
                <button
                  type="button"
                  className="segment"
                  aria-pressed={settings.agentLanguage === "en"}
                  onClick={() => setSettings(prev => prev ? { ...prev, agentLanguage: "en" } : prev)}
                >
                  English
                </button>
                <button
                  type="button"
                  className="segment"
                  aria-pressed={settings.agentLanguage === "es"}
                  onClick={() => setSettings(prev => prev ? { ...prev, agentLanguage: "es" } : prev)}
                >
                  Español
                </button>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Bell size={16} strokeWidth={1.75} />
                Notifications &amp; Contact
              </h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field full">
                  <label htmlFor="notifEmail">Notification email</label>
                  <input
                    id="notifEmail"
                    ref={notificationEmailRef}
                    type="email"
                    required
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
                    ref={contactPhoneRef}
                    type="tel"
                    required
                    pattern="\+?[\d\s().-]{7,20}"
                    value={settings.contactPhone}
                    onChange={e => setSettings(prev => prev ? { ...prev, contactPhone: e.target.value } : prev)}
                    placeholder="+1 (305) 555-0100"
                  />
                </div>
                <div className="field full">
                  <label htmlFor="contactEmail">Public contact email</label>
                  <input
                    id="contactEmail"
                    ref={contactEmailRef}
                    type="email"
                    value={settings.contactEmail}
                    onChange={e => setSettings(prev => prev ? { ...prev, contactEmail: e.target.value } : prev)}
                    placeholder="hello@yourcompany.com"
                  />
                </div>
                <div className="field full">
                  <label htmlFor="licenseNumber">License number</label>
                  <input id="licenseNumber" maxLength={40} value={settings.licenseNumber ?? ""} onChange={e => setSettings(prev => prev ? { ...prev, licenseNumber: e.target.value } : prev)} />
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

      {canManageTeam && <TeamPanel businessId={businessId} />}
    </>
  );
}

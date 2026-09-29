"use client";

import { useEffect, useRef, useState } from "react";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useAuth } from "@/contexts/AuthContext";
import { useBootstrap } from "@/contexts/BootstrapContext";
import { SUPPORTED_TIMEZONES } from "@/hooks/useBusinessTimezone";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import { Toggle } from "@/components/ui/Toggle";
import { TeamPanel } from "./TeamPanel";
import { NoticesPanel } from "./NoticesPanel";
import {
  composeGreetingWithDisclosure,
  defaultRecordingDisclosureText,
  RECORDING_DISCLOSURE_MAX_LENGTH,
} from "@/lib/recordingDisclosure";
import { Bell, Clock3, Mic, Save, Settings } from "lucide-react";
import { DEFAULT_INVOICE_COPY, type InvoiceCopyDefaults } from "@/lib/documents/invoiceCopy";
import { HoursEditor, DEFAULT_BUSINESS_HOURS } from "@/components/scheduling/HoursEditor";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s().-]{7,20}$/;

interface Settings {
  timezone: string;
  businessHours: string | Record<string, string>;
  notificationEmail: string;
  contactPhone: string;
  contactEmail: string;
  licenseNumber: string;
  businessName: string;
  invoiceCopy?: InvoiceCopyDefaults;
  agentLanguage: "en" | "es";
  // Call-recording notice (Phase 16, T-102) — optional so an older cached
  // response can never crash this page.
  greeting?: string;
  afterHoursGreeting?: string;
  recordingDisclosure?: { enabled: boolean; text: string };
}

// C-B stand-in until the line registry producer merges.
interface PhoneLineView {
  lineId: string;
  businessId: string;
  e164: string;
  display: string;
  country: "US" | "CA";
  label: string;
  purpose: "client" | "demo";
  status: "draft" | "provisioned" | "connected" | "test_passed" | "live" | "retired";
  sms: { status: "not_configured" | "pending_registration" | "ready" | "blocked"; purposes: string[]; isDefaultSender: boolean };
  nextStep: string;
}

const SECTIONS = [
  ["company", "Company"], ["hours", "Hours & timezone"], ["phone", "Phone & notifications"],
  ["documents", "Documents"], ["terms", "Terms & notices"], ["advanced", "Advanced"],
] as const;

export default function CompanySettingsPage() {
  const businessId = useBusinessId();
  const { user } = useAuth();
  const smsEnabled = useBootstrap().data?.business.smsEnabled === true;
  const canManageTeam = user?.role === "owner" || !!user?.superadmin;

  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [hoursValid, setHoursValid] = useState(true);
  const [phoneLines, setPhoneLines] = useState<PhoneLineView[] | null>(null);
  const savedSettingsRef = useRef("");
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
      .then(d => { setSettings(d); savedSettingsRef.current = JSON.stringify(d); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    let live = true;
    fetch("/api/company/phone-lines?businessId=" + encodeURIComponent(businessId))
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { lines?: PhoneLineView[] }) => { if (live) setPhoneLines(Array.isArray(data.lines) ? data.lines : null); })
      .catch(() => { if (live) setPhoneLines(null); });
    return () => { live = false; };
  }, [businessId]);

  const dirty = settings !== null && savedSettingsRef.current !== "" && JSON.stringify(settings) !== savedSettingsRef.current;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (loading) return <PageSkeleton rows={5} />;
  if (loadError || !settings) {
    return (
      <PageError
        message="Settings could not be loaded. No saved configuration is being shown."
        onRetry={() => window.location.reload()}
      />
    );
  }

  async function save() {
    if (!businessId || !settings) return;
    const notificationEmail = settings.notificationEmail.trim();
    const contactPhone = settings.contactPhone.trim();
    const contactEmail = settings.contactEmail.trim();
    if (!hoursValid) {
      setError("Fix the business hours before saving.");
      return;
    }
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
      payload.invoiceCopy = settings.invoiceCopy ?? DEFAULT_INVOICE_COPY;
      const res = await fetch("/api/company/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Settings save failed");
      }
      setSaved(true);
      savedSettingsRef.current = JSON.stringify(settings);
      if (data.vapiSyncWarning) setWarning(data.vapiSyncWarning);
      // Clear timezone cache so next nav picks up new value
      try { sessionStorage.removeItem(`tz_${businessId}`); } catch {}
      setTimeout(() => setSaved(false), 3000);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Settings could not be saved. Review the form and try again.");
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

      {dirty && <p role="status" className="settings-unsaved">Unsaved changes — save before leaving this page.</p>}
      <div className="settings-jump-phone">
        <label htmlFor="settings-jump">Jump to</label>
        <select id="settings-jump" defaultValue="" onChange={(event) => { if (event.target.value) document.getElementById(event.target.value)?.scrollIntoView({ behavior: "smooth" }); }}>
          <option value="" disabled>Choose a section</option>
          {SECTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
      <div className="settings-phase32-layout">
        <nav className="settings-section-list" aria-label="Settings sections">
          {SECTIONS.map(([id, label]) => <a key={id} href={"#" + id}>{label}</a>)}
        </nav>
        <div className="settings-section-content">
          <section id="company" className="panel">
            <div className="panel-header"><h2 className="panel-title">Company</h2></div>
            <div className="panel-body form-grid">
              <div className="field full"><label>Business name</label><p>{settings.businessName}</p></div>
              <div className="field"><label htmlFor="contactPhone">Public contact phone</label><input id="contactPhone" ref={contactPhoneRef} type="tel" required pattern="\+?[\d\s().-]{7,20}" value={settings.contactPhone} onChange={(event) => setSettings((prev) => prev ? { ...prev, contactPhone: event.target.value } : prev)} /></div>
              <div className="field"><label htmlFor="contactEmail">Public contact email</label><input id="contactEmail" ref={contactEmailRef} type="email" value={settings.contactEmail} onChange={(event) => setSettings((prev) => prev ? { ...prev, contactEmail: event.target.value } : prev)} /></div>
              <div className="field"><label htmlFor="licenseNumber">License number</label><input id="licenseNumber" maxLength={40} value={settings.licenseNumber ?? ""} onChange={(event) => setSettings((prev) => prev ? { ...prev, licenseNumber: event.target.value } : prev)} /></div>
            </div>
          </section>

          <section id="hours" className="panel">
            <div className="panel-header"><h2 className="panel-title"><Clock3 size={16} strokeWidth={1.75} /> Hours &amp; timezone</h2></div>
            <div className="panel-body">
              <p>Your receptionist offers appointments during these hours.</p>
              <HoursEditor value={settings.businessHours || DEFAULT_BUSINESS_HOURS} onChange={(businessHours) => setSettings((prev) => prev ? { ...prev, businessHours } : prev)} onValidityChange={setHoursValid} idPrefix="settings-hours" />
              <div className="field"><label htmlFor="tz">Your business timezone</label><select id="tz" value={settings.timezone} onChange={(event) => setSettings((prev) => prev ? { ...prev, timezone: event.target.value } : prev)}>
                {SUPPORTED_TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select></div>
            </div>
          </section>

          <section id="phone" className="panel">
            <div className="panel-header"><h2 className="panel-title"><Bell size={16} strokeWidth={1.75} /> Phone &amp; notifications</h2></div>
            <div className="panel-body">
              <div className="field"><label htmlFor="notifEmail">Notification email</label><input id="notifEmail" ref={notificationEmailRef} type="email" required value={settings.notificationEmail} onChange={(event) => setSettings((prev) => prev ? { ...prev, notificationEmail: event.target.value } : prev)} /><p>Receives booking and request notifications.</p></div>
              <div className="field"><label htmlFor="agentLanguage">Phone AI language</label><select id="agentLanguage" value={settings.agentLanguage} onChange={(event) => setSettings((prev) => prev ? { ...prev, agentLanguage: event.target.value as "en" | "es" } : prev)}><option value="en">English</option><option value="es">Español</option></select><p>Changes the greeting on the next call. Field updates continue to understand English and Spanish.</p></div>
              <div className="settings-phone-lines">
                <h3>Phone lines and texting</h3>
                {phoneLines === null ? <p>Line status unavailable</p> : phoneLines.length === 0 ? <p>No line on record — Luxor sets this up</p> : phoneLines.map((line) => <div key={line.lineId} className="settings-phone-line">
                  <strong>{line.label || line.display}</strong><span>{line.display}</span>
                  <span>{line.sms.status === "ready" ? (smsEnabled ? "Texting ready" : "SMS ready on this line; texting is off") : line.sms.status === "pending_registration" ? "Texting registration pending" : line.sms.status === "blocked" ? "Texting blocked" : "Texting not configured"}</span>
                  <small>{line.nextStep}</small>
                </div>)}
              </div>
              <a href="mailto:connect@luxordev.com">Contact Luxor to change your phone line</a>
            </div>
          </section>

          <section id="documents" className="panel">
            <div className="panel-header"><h2 className="panel-title">Documents</h2></div>
            <div className="panel-body">
              <p>Default invoice wording. Each draft invoice can be edited before it is sent.</p>
              {(["opening", "closing", "thankYou", "terms"] as const).map((key) => <div className="field" key={key}>
                <label htmlFor={"invoice-" + key}>{key === "thankYou" ? "Thank-you line" : key[0].toUpperCase() + key.slice(1)}</label>
                <textarea id={"invoice-" + key} rows={key === "terms" ? 2 : 3} value={(settings.invoiceCopy ?? DEFAULT_INVOICE_COPY)[key]} onChange={(event) => setSettings((prev) => prev ? { ...prev, invoiceCopy: { ...(prev.invoiceCopy ?? DEFAULT_INVOICE_COPY), [key]: event.target.value } } : prev)} />
              </div>)}
              <p>Use {"{businessName}"}, {"{address}"}, {"{visitDate}"}, and {"{industryNoun}"} for invoice-specific details.</p>
            </div>
          </section>

          <section id="terms" aria-label="Terms & notices">
            <h2>Terms &amp; notices</h2>
            <NoticesPanel businessId={businessId} />
          </section>

          <section id="advanced" className="settings-advanced">
            <h2>Advanced</h2>
            {canManageTeam && <section className="panel">
              <div className="panel-header"><h3 className="panel-title"><Mic size={16} strokeWidth={1.75} /> Call recording notice</h3></div>
              <div className="panel-body">
                <p>The default wording is a draft, not legal advice. Have counsel review it before relying on it.</p>
                <Toggle checked={disclosure.enabled} onChange={(next) => setSettings((prev) => prev ? { ...prev, recordingDisclosure: { ...disclosure, enabled: next } } : prev)} label="Speak the recording notice on every call" />
                <span> Speak the notice at the start of every call</span>
                {disclosure.enabled && <div className="field">
                  <label htmlFor="recordingText">Spoken notice</label>
                  <textarea id="recordingText" rows={3} maxLength={RECORDING_DISCLOSURE_MAX_LENGTH} value={disclosure.text} onChange={(event) => setSettings((prev) => prev ? { ...prev, recordingDisclosure: { ...disclosure, text: event.target.value } } : prev)} placeholder={defaultRecordingDisclosureText(settings.agentLanguage)} />
                  <p>{disclosure.text.length}/{RECORDING_DISCLOSURE_MAX_LENGTH} characters. {disclosure.text.trim() ? "" : "The default notice is spoken if this is blank."}</p>
                  <strong>Live preview — what callers hear first</strong><p>{previewGreeting}</p><strong>After hours</strong><p>{previewAfterHours}</p>
                </div>}
              </div>
            </section>}
            {canManageTeam && <TeamPanel businessId={businessId} />}
            <p>For services, FAQs, agent voice, or other setup changes, contact <a href="mailto:connect@luxordev.com">connect@luxordev.com</a>.</p>
          </section>
        </div>
      </div>
    </>
  );
}

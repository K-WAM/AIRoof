"use client";

import { use, useEffect, useState } from "react";
import { PLAN_PRESETS } from "@/lib/ai/planPresets";
import { VERTICAL_TEMPLATES } from "@/lib/verticals/templates";
import { US_TIMEZONES } from "@/hooks/useBusinessTimezone";

interface BizData {
  businessName: string;
  industry: string;
  active: boolean;
  serviceArea: string | string[];
  phoneNumber?: string;
  calendarProvider?: string;
  escalationPhone?: string;
  notificationEmail?: string;
  planTier?: string;
  agentName?: string;
  agentIdentity?: string;
  greeting?: string;
  afterHoursGreeting?: string;
  agentVoice?: string;
  emergencyRules?: string[];
  bookingRules?: string[];
  timezone?: string;
  vapiAssistantId?: string;
  vapiPhoneNumberId?: string;
  callbackDelayMinutes?: number;
  maxCallAttempts?: number;
  callbackWindowStart?: number;
  callbackWindowEnd?: number;
  brandColor?: string;
  logoUrl?: string;
  contactPhone?: string;
  contactEmail?: string;
  websiteUrl?: string;
}

interface OnboardingData {
  profileComplete?: boolean;
  agentRulesComplete?: boolean;
  faqComplete?: boolean;
  phoneMapped?: boolean;
  testCallsPassed?: boolean;
  readyForLaunch?: boolean;
}

const readinessChecks = [
  { key: "profileComplete", label: "Business profile completed" },
  { key: "agentRulesComplete", label: "Services and rules reviewed" },
  { key: "faqComplete", label: "FAQs approved by company" },
  { key: "phoneMapped", label: "Phone number mapped" },
  { key: "testCallsPassed", label: "Test calls passed" },
  { key: "readyForLaunch", label: "Ready for launch" },
];

export default function AdminBusinessConfigPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = use(params);
  const [biz, setBiz] = useState<BizData | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitStatus, setSubmitStatus] = useState<{
    type: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });

  useEffect(() => {
    fetch(`/api/admin/businesses/${businessId}/config`)
      .then((r) => r.json())
      .then((data) => {
        setBiz(data.business ?? null);
        setOnboarding(data.onboarding ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [businessId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitStatus({ type: "submitting", message: "Saving config..." });

    const formData = new FormData(event.currentTarget);
    const activeStatus = String(formData.get("active") || "draft");

    const payload = {
      businessName: String(formData.get("businessName") || "").trim(),
      industry: String(formData.get("industry") || "roofing"),
      active: activeStatus === "active",
      serviceArea: String(formData.get("serviceArea") || "")
        .split(",")
        .map((area) => area.trim())
        .filter(Boolean),
      phoneNumber: String(formData.get("phoneNumber") || "").trim(),
      calendarProvider: String(formData.get("calendarProvider") || "mock"),
      escalationPhone: String(formData.get("escalationPhone") || "").trim(),
      notificationEmail: String(formData.get("notificationEmail") || "").trim(),
      planTier: String(formData.get("planTier") || "standard"),
      agentName: String(formData.get("agentName") || "").trim(),
      agentIdentity: String(formData.get("agentIdentity") || "").trim(),
      greeting: String(formData.get("greeting") || "").trim(),
      afterHoursGreeting: String(formData.get("afterHoursGreeting") || "").trim(),
      agentVoice: String(formData.get("agentVoice") || "").trim(),
      emergencyRules: String(formData.get("emergencyRules") || "")
        .split("\n")
        .map((rule) => rule.trim())
        .filter(Boolean),
      bookingRules: String(formData.get("bookingRules") || "")
        .split("\n")
        .map((rule) => rule.trim())
        .filter(Boolean),
      timezone: String(formData.get("timezone") || "America/New_York"),
      // Vapi
      vapiAssistantId: String(formData.get("vapiAssistantId") || "").trim(),
      vapiPhoneNumberId: String(formData.get("vapiPhoneNumberId") || "").trim(),
      callbackDelayMinutes: formData.get("callbackDelayMinutes") !== "" ? Number(formData.get("callbackDelayMinutes")) : undefined,
      maxCallAttempts: formData.get("maxCallAttempts") !== "" ? Number(formData.get("maxCallAttempts")) : undefined,
      callbackWindowStart: formData.get("callbackWindowStart") !== "" ? Number(formData.get("callbackWindowStart")) : undefined,
      callbackWindowEnd: formData.get("callbackWindowEnd") !== "" ? Number(formData.get("callbackWindowEnd")) : undefined,
      // Branding
      brandColor: String(formData.get("brandColor") || "").trim(),
      logoUrl: String(formData.get("logoUrl") || "").trim() || null,
      contactPhone: String(formData.get("contactPhone") || "").trim(),
      contactEmail: String(formData.get("contactEmail") || "").trim(),
      websiteUrl: String(formData.get("websiteUrl") || "").trim(),
      applyTemplateDefaults: formData.get("applyTemplateDefaults") === "on",
      onboarding: Object.fromEntries(
        readinessChecks.map((check) => [check.key, formData.get(check.key) === "on"])
      ),
      actorEmail: "connect@luxordev.com",
    };

    try {
      const response = await fetch(`/api/admin/businesses/${businessId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to save config");
      }

      setSubmitStatus({ type: "success", message: `Saved config for ${businessId}.` });
    } catch (error) {
      setSubmitStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to save config",
      });
    }
  }

  if (loading) return <div style={{ padding: 32, color: "#666" }}>Loading config…</div>;
  if (!biz) return <div style={{ padding: 32, color: "#b91c1c" }}>Business not found.</div>;

  const serviceAreaStr = Array.isArray(biz.serviceArea)
    ? biz.serviceArea.join(", ")
    : (biz.serviceArea ?? "");

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Company Config</h1>
          <p className="page-subtitle">
            Edit agent settings, voice, routing, and Vapi IDs for{" "}
            <strong>{biz.businessName}</strong> ({businessId}).
          </p>
        </div>
        <a className="button" href="/admin/businesses">← All companies</a>
      </header>

      <form className="config-grid" onSubmit={handleSubmit}>
        <div className="section-stack">

          {/* ─── Business Profile ─── */}
          <section className="panel" aria-labelledby="profile-config-title">
            <div className="panel-header">
              <h2 className="panel-title" id="profile-config-title">Business Profile</h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="businessName">Business name</label>
                  <input id="businessName" name="businessName" defaultValue={biz.businessName} />
                </div>
                <div className="field">
                  <label htmlFor="industry">Industry template</label>
                  <select id="industry" name="industry" defaultValue={biz.industry ?? "roofing"}>
                    {Object.values(VERTICAL_TEMPLATES).map((t) => (
                      <option value={t.verticalId} key={t.verticalId}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="active">Status</label>
                  <select id="active" name="active" defaultValue={biz.active ? "active" : "draft"}>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="serviceArea">Service area (comma-separated)</label>
                  <input id="serviceArea" name="serviceArea" defaultValue={serviceAreaStr} />
                </div>
                <div className="field">
                  <label htmlFor="timezone">Business timezone</label>
                  <select id="timezone" name="timezone" defaultValue={biz.timezone ?? "America/New_York"}>
                    {US_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* ─── Vapi Integration ─── */}
          <section className="panel" aria-labelledby="vapi-config-title">
            <div className="panel-header">
              <h2 className="panel-title" id="vapi-config-title">Vapi Integration</h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field full">
                  <label htmlFor="vapiAssistantId">Vapi assistant ID</label>
                  <input
                    id="vapiAssistantId"
                    name="vapiAssistantId"
                    placeholder="e.g. 9267a84a-0f4f-416b-a328-1dc539f5265e"
                    defaultValue={biz.vapiAssistantId ?? ""}
                    style={{ fontFamily: "monospace", fontSize: 13 }}
                  />
                </div>
                <div className="field full">
                  <label htmlFor="vapiPhoneNumberId">Vapi phone number ID</label>
                  <input
                    id="vapiPhoneNumberId"
                    name="vapiPhoneNumberId"
                    placeholder="e.g. pn_xxxxxxxxxxxxxxxx"
                    defaultValue={biz.vapiPhoneNumberId ?? ""}
                    style={{ fontFamily: "monospace", fontSize: 13 }}
                  />
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                Find these in your Vapi dashboard → Assistants and Phone Numbers.
                Set them here so calls route to the correct agent.
              </p>

              {/* Auto-callback config */}
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
                <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>Auto-callback settings</p>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="callbackDelayMinutes">Initial callback delay</label>
                    <select id="callbackDelayMinutes" name="callbackDelayMinutes" defaultValue={biz.callbackDelayMinutes ?? ""}>
                      <option value="">Disabled</option>
                      <option value="0">Immediate</option>
                      <option value="5">5 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="60">1 hour</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="maxCallAttempts">Max call attempts</label>
                    <select id="maxCallAttempts" name="maxCallAttempts" defaultValue={biz.maxCallAttempts ?? 3}>
                      <option value="1">1</option>
                      <option value="3">3</option>
                      <option value="5">5</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="callbackWindowStart">Calling window start (hour)</label>
                    <select id="callbackWindowStart" name="callbackWindowStart" defaultValue={biz.callbackWindowStart ?? 8}>
                      {[6,7,8,9,10].map((h) => <option key={h} value={h}>{h}:00 AM</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="callbackWindowEnd">Calling window end (hour)</label>
                    <select id="callbackWindowEnd" name="callbackWindowEnd" defaultValue={biz.callbackWindowEnd ?? 20}>
                      {[17,18,19,20,21].map((h) => <option key={h} value={h}>{h > 12 ? `${h-12}:00 PM` : `${h}:00 PM`}</option>)}
                    </select>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                  When a new lead is captured, Alice will automatically call back after the configured delay — only within the calling window and only if Vapi IDs are set above.
                </p>
              </div>
            </div>
          </section>

          {/* ─── AI Model and Voice ─── */}
          <section className="panel" aria-labelledby="ai-config-title">
            <div className="panel-header">
              <h2 className="panel-title" id="ai-config-title">AI Model and Voice</h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="planTier">Plan tier</label>
                  <select id="planTier" name="planTier" defaultValue={biz.planTier ?? "standard"}>
                    {Object.values(PLAN_PRESETS).map((preset) => (
                      <option value={preset.planTier} key={preset.planTier}>{preset.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="agentName">Receptionist name</label>
                  <input id="agentName" name="agentName" defaultValue={biz.agentName ?? "Mia"} />
                </div>
                <div className="field">
                  <label htmlFor="agentIdentity">Role</label>
                  <select id="agentIdentity" name="agentIdentity" defaultValue={biz.agentIdentity ?? "receptionist"}>
                    <option value="receptionist">Receptionist</option>
                    <option value="front desk assistant">Front desk assistant</option>
                    <option value="booking assistant">Booking assistant</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="agentVoice">Voice</label>
                  <input
                    id="agentVoice"
                    name="agentVoice"
                    placeholder="e.g. eleven_turbo_v2_5 or Polly.Matthew-Generative"
                    defaultValue={biz.agentVoice ?? ""}
                  />
                </div>
                <div className="field full">
                  <label htmlFor="greeting">Greeting</label>
                  <input id="greeting" name="greeting" defaultValue={biz.greeting ?? ""} />
                </div>
                <div className="field full">
                  <label htmlFor="afterHoursGreeting">After-hours greeting</label>
                  <input id="afterHoursGreeting" name="afterHoursGreeting" defaultValue={biz.afterHoursGreeting ?? ""} />
                </div>
                <label className="check-row">
                  <input name="applyTemplateDefaults" type="checkbox" />
                  <span>Reapply selected industry template defaults</span>
                </label>
              </div>
            </div>
          </section>

          {/* ─── Services and Rules ─── */}
          <section className="panel" aria-labelledby="services-config-title">
            <div className="panel-header">
              <h2 className="panel-title" id="services-config-title">Services and Rules</h2>
            </div>
            <div className="panel-body">
              <div className="rule-section">
                <div className="field">
                  <label htmlFor="emergencyRules">Emergency rules (one per line)</label>
                  <textarea
                    id="emergencyRules"
                    name="emergencyRules"
                    defaultValue={(biz.emergencyRules ?? []).join("\n")}
                    rows={5}
                  />
                </div>
                <div className="field">
                  <label htmlFor="bookingRules">Booking rules (one per line)</label>
                  <textarea
                    id="bookingRules"
                    name="bookingRules"
                    defaultValue={(biz.bookingRules ?? []).join("\n")}
                    rows={5}
                  />
                </div>
              </div>
            </div>
          </section>

        </div>

        <aside className="section-stack">

          {/* ─── Routing ─── */}
          <section className="panel" aria-labelledby="routing-title">
            <div className="panel-header">
              <h2 className="panel-title" id="routing-title">Routing</h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="phoneNumber">Main phone</label>
                  <input id="phoneNumber" name="phoneNumber" defaultValue={biz.phoneNumber ?? ""} />
                </div>
                <div className="field">
                  <label htmlFor="calendarProvider">Calendar provider</label>
                  <select id="calendarProvider" name="calendarProvider" defaultValue={biz.calendarProvider ?? "mock"}>
                    <option value="mock">Mock scheduling</option>
                    <option value="google">Google Calendar</option>
                    <option value="calendly">Calendly</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="escalationPhone">Escalation phone</label>
                  <input id="escalationPhone" name="escalationPhone" defaultValue={biz.escalationPhone ?? ""} />
                </div>
                <div className="field">
                  <label htmlFor="notificationEmail">Notification email</label>
                  <input id="notificationEmail" name="notificationEmail" defaultValue={biz.notificationEmail ?? ""} />
                </div>
              </div>
            </div>
          </section>

          {/* ─── Branding ─── */}
          <section className="panel" aria-labelledby="branding-title">
            <div className="panel-header">
              <h2 className="panel-title" id="branding-title">Branding</h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="brandColor">Brand color (hex)</label>
                  <input id="brandColor" name="brandColor" placeholder="#1e3a5f" defaultValue={biz.brandColor ?? ""} />
                </div>
                <div className="field">
                  <label htmlFor="contactPhone">Contact phone (public)</label>
                  <input id="contactPhone" name="contactPhone" defaultValue={biz.contactPhone ?? ""} />
                </div>
                <div className="field full">
                  <label htmlFor="logoUrl">Logo URL (HTTPS)</label>
                  <input id="logoUrl" name="logoUrl" placeholder="https://…/logo.png" defaultValue={biz.logoUrl ?? ""} />
                </div>
                <div className="field full">
                  <label htmlFor="contactEmail">Contact email (public)</label>
                  <input id="contactEmail" name="contactEmail" defaultValue={biz.contactEmail ?? ""} />
                </div>
                <div className="field full">
                  <label htmlFor="websiteUrl">Website URL</label>
                  <input id="websiteUrl" name="websiteUrl" placeholder="https://…" defaultValue={biz.websiteUrl ?? ""} />
                </div>
              </div>
            </div>
          </section>

          {/* ─── Launch Readiness ─── */}
          <section className="panel" aria-labelledby="readiness-title">
            <div className="panel-header">
              <h2 className="panel-title" id="readiness-title">Launch Readiness</h2>
            </div>
            <div className="panel-body">
              <div className="readiness-list">
                {readinessChecks.map((check) => (
                  <label className="check-row" key={check.key}>
                    <input
                      name={check.key}
                      type="checkbox"
                      defaultChecked={
                        onboarding?.[check.key as keyof OnboardingData] ?? false
                      }
                    />
                    <span>{check.label}</span>
                  </label>
                ))}
              </div>
              <div className="button-row" style={{ marginTop: 16 }}>
                <button
                  className="button primary"
                  type="submit"
                  disabled={submitStatus.type === "submitting"}
                >
                  {submitStatus.type === "submitting" ? "Saving…" : "Save config"}
                </button>
              </div>
              {submitStatus.message ? (
                <p
                  className="helper-text"
                  role={submitStatus.type === "error" ? "alert" : "status"}
                  style={{
                    marginTop: 12,
                    color: submitStatus.type === "error" ? "#b91c1c" : submitStatus.type === "success" ? "#15803d" : undefined,
                  }}
                >
                  {submitStatus.message}
                </p>
              ) : null}
            </div>
          </section>

        </aside>
      </form>
    </>
  );
}

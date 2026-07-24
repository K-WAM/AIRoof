"use client";

import { useEffect, useState } from "react";
import { PLAN_PRESETS } from "@/lib/ai/planPresets";
import { VERTICAL_TEMPLATES } from "@/lib/verticals/templates";
import { SUPPORTED_TIMEZONES } from "@/hooks/useBusinessTimezone";
import {
  Building2,
  ClipboardList,
  Copy,
  LayoutTemplate,
  ListChecks,
  PhoneCall,
  Rocket,
  Route,
  Settings,
  UserPlus,
} from "lucide-react";

const wizardSteps = [
  "Company profile",
  "Template and plan",
  "Services and FAQs",
  "Rules and routing",
  "Vapi and branding",
  "Launch readiness",
];

const roofingTemplate = VERTICAL_TEMPLATES.roofing;

const readinessChecks = [
  "Business owner contact confirmed",
  "Service area and hours entered",
  "Template defaults reviewed",
  "Phone routing planned",
  "Emergency escalation contact confirmed",
  "Test calls pending",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s().-]{7,20}$/;

export default function OnboardingPage() {
  const [submitStatus, setSubmitStatus] = useState<{
    type: "idle" | "submitting" | "success" | "error";
    message: string;
    businessId?: string;
    loginEmail?: string;
    tempPassword?: string;
  }>({ type: "idle", message: "" });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const message = "You have unsaved onboarding changes. Leave this page?";
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };
    const preventDirtyNavigation = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank") return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", preventDirtyNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", preventDirtyNavigation, true);
    };
  }, [dirty]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const validationChecks = [
      { name: "businessName", valid: Boolean(String(formData.get("businessName") || "").trim()), message: "Enter a business name." },
      { name: "businessId", valid: Boolean(String(formData.get("businessId") || "").trim()), message: "Enter a business ID." },
      { name: "ownerEmail", valid: EMAIL_PATTERN.test(String(formData.get("ownerEmail") || "").trim()), message: "Enter a valid owner email." },
      { name: "phoneNumber", valid: PHONE_PATTERN.test(String(formData.get("phoneNumber") || "").trim()), message: "Enter a valid main phone number." },
      { name: "notificationEmail", valid: !String(formData.get("notificationEmail") || "").trim() || EMAIL_PATTERN.test(String(formData.get("notificationEmail") || "").trim()), message: "Enter a valid notification email." },
      { name: "escalationPhone", valid: !String(formData.get("escalationPhone") || "").trim() || PHONE_PATTERN.test(String(formData.get("escalationPhone") || "").trim()), message: "Enter a valid escalation phone number." },
      { name: "contactPhone", valid: !String(formData.get("contactPhone") || "").trim() || PHONE_PATTERN.test(String(formData.get("contactPhone") || "").trim()), message: "Enter a valid contact phone number." },
    ];
    const invalid = validationChecks.find((check) => !check.valid);
    if (invalid) {
      setSubmitStatus({ type: "error", message: invalid.message });
      const field = event.currentTarget.elements.namedItem(invalid.name);
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    setSubmitStatus({ type: "submitting", message: "Creating company..." });

    const serviceArea = String(formData.get("serviceArea") || "")
      .split(",")
      .map((area) => area.trim())
      .filter(Boolean);

    const payload = {
      businessName: String(formData.get("businessName") || "").trim(),
      businessId: String(formData.get("businessId") || "").trim(),
      ownerEmail: String(formData.get("ownerEmail") || "").trim(),
      phoneNumber: String(formData.get("phoneNumber") || "").trim(),
      serviceArea,
      timezone: String(formData.get("timezone") || "America/New_York"),
      industry: String(formData.get("industry") || "roofing"),
      planTier: String(formData.get("planTier") || "standard"),
      agentName: String(formData.get("agentName") || "Mia").trim(),
      agentIdentity: String(formData.get("agentIdentity") || "receptionist").trim(),
      greeting: String(formData.get("greeting") || "").trim(),
      afterHoursGreeting: String(formData.get("afterHoursGreeting") || "").trim(),
      agentVoice: String(formData.get("voice") || "alice"),
      calendarProvider: String(formData.get("calendarProvider") || "mock"),
      escalationPhone: String(formData.get("escalationPhone") || "").trim(),
      notificationEmail: String(formData.get("notificationEmail") || "").trim(),
      emergencyRules: String(formData.get("emergencyRules") || "")
        .split("\n")
        .map((rule) => rule.trim())
        .filter(Boolean),
      bookingRules: String(formData.get("bookingRules") || "")
        .split("\n")
        .map((rule) => rule.trim())
        .filter(Boolean),
      // Vapi
      vapiAssistantId: String(formData.get("vapiAssistantId") || "").trim() || undefined,
      vapiPhoneNumberId: String(formData.get("vapiPhoneNumberId") || "").trim() || undefined,
      // Branding
      brandColor: String(formData.get("brandColor") || "").trim() || undefined,
      contactPhone: String(formData.get("contactPhone") || "").trim() || undefined,
      logoUrl: String(formData.get("logoUrl") || "").trim() || null,
      active: false,
      actorEmail: "connect@luxordev.com",
    };

    try {
      const response = await fetch("/api/admin/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create company");
      }

      setSubmitStatus({
        type: "success",
        message: `${result.businessId} created.`,
        businessId: result.businessId,
        loginEmail: result.loginEmail,
        tempPassword: result.tempPassword,
      });
      setDirty(false);
    } catch {
      setSubmitStatus({
        type: "error",
        message: "The company could not be created. Review the form and try again.",
      });
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserPlus size={20} strokeWidth={1.75} />
            Company Onboarding
          </h1>
          <p className="page-subtitle">
            Create a tenant with guided defaults for industry template, AI plan,
            voice, services, rules, routing, and launch readiness.
          </p>
        </div>
        <span className="status-pill">Draft setup</span>
      </header>

      <form className="wizard-grid" onSubmit={handleSubmit} onChange={() => setDirty(true)}>
        <section className="section-stack">
          <section className="panel" aria-labelledby="profile-title">
            <div className="panel-header">
              <h2 className="panel-title" id="profile-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Building2 size={16} strokeWidth={1.75} />
                1. Company Profile
              </h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="businessName">Business name</label>
                  <input id="businessName" name="businessName" required placeholder="Apex Roofing" />
                </div>
                <div className="field">
                  <label htmlFor="businessId">Business ID</label>
                  <input id="businessId" name="businessId" required placeholder="apex-roofing" />
                </div>
                <div className="field">
                  <label htmlFor="ownerEmail">Owner email</label>
                  <input id="ownerEmail" name="ownerEmail" type="email" required placeholder="owner@example.com" />
                </div>
                <div className="field">
                  <label htmlFor="phoneNumber">Main phone</label>
                  <input id="phoneNumber" name="phoneNumber" type="tel" required pattern="\+?[\d\s().-]{7,20}" placeholder="+1 (604) 555-1234" />
                </div>
                <div className="field full">
                  <label htmlFor="serviceArea">Service area</label>
                  <textarea
                    id="serviceArea"
                    name="serviceArea"
                    placeholder="Vancouver, Burnaby, New Westminster, Coquitlam"
                  />
                </div>
                <div className="field">
                  <label htmlFor="timezone">Business timezone</label>
                  <select id="timezone" name="timezone" defaultValue="America/New_York">
                    {SUPPORTED_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="template-title">
            <div className="panel-header">
              <h2 className="panel-title" id="template-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <LayoutTemplate size={16} strokeWidth={1.75} />
                2. Template and Plan
              </h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="industry">Industry template</label>
                  <select id="industry" name="industry" defaultValue="roofing">
                    {Object.values(VERTICAL_TEMPLATES).map((template) => (
                      <option value={template.verticalId} key={template.verticalId}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="planTier">Plan</label>
                  <select id="planTier" name="planTier" defaultValue="standard">
                    {Object.values(PLAN_PRESETS).map((preset) => (
                      <option value={preset.planTier} key={preset.planTier}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="agentName">Receptionist name</label>
                  <input id="agentName" name="agentName" defaultValue="Mia" />
                </div>
                <div className="field">
                  <label htmlFor="agentIdentity">Role</label>
                  <select id="agentIdentity" name="agentIdentity" defaultValue="receptionist">
                    <option value="receptionist">Receptionist</option>
                    <option value="front desk assistant">Front desk assistant</option>
                    <option value="booking assistant">Booking assistant</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="voice">Voice</label>
                  <select id="voice" name="voice" defaultValue="alice">
                    <option value="alice">Alice - clear and professional</option>
                    <option value="woman">Woman - clear and direct</option>
                    <option value="man">Man - clear and direct</option>
                  </select>
                </div>
                <div className="field full">
                  <label htmlFor="greeting">Greeting</label>
                  <input
                    id="greeting"
                    name="greeting"
                    defaultValue="Thanks for calling Apex Roofing, this is Mia. How can I help?"
                  />
                </div>
                <div className="field full">
                  <label htmlFor="afterHoursGreeting">After-hours greeting</label>
                  <input
                    id="afterHoursGreeting"
                    name="afterHoursGreeting"
                    defaultValue="Thanks for calling Apex Roofing, this is Mia. The office is closed, but I can still help take a message or flag an urgent roof leak."
                  />
                </div>
                <div className="field">
                  <label htmlFor="calendarProvider">Calendar</label>
                  <select id="calendarProvider" name="calendarProvider" defaultValue="mock">
                    <option value="mock">Mock scheduling</option>
                    <option value="google">Google Calendar</option>
                    <option value="calendly">Calendly</option>
                  </select>
                </div>
              </div>

              <div className="queue-list" style={{ marginTop: 16 }}>
                {Object.values(PLAN_PRESETS).map((preset) => (
                  <article className="queue-item" key={preset.planTier}>
                    <p className="queue-title">{preset.label}</p>
                    <p className="queue-meta">{preset.description}</p>
                    <p className="queue-meta">
                      {preset.liveModel} · {preset.backOfficeModel} · {preset.agentVoice}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="defaults-title">
            <div className="panel-header">
              <h2 className="panel-title" id="defaults-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ListChecks size={16} strokeWidth={1.75} />
                3. Roofing Defaults
              </h2>
            </div>
            <div className="panel-body">
              <div className="rule-section">
                <div className="rule-group">
                  <h3 className="rule-heading">Services</h3>
                  <div className="chip-list">
                    {roofingTemplate.approvedServices.map((service) => (
                      <span className="chip" key={service}>
                        {service}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rule-group">
                  <h3 className="rule-heading">Approved FAQs</h3>
                  <div className="faq-list">
                    {roofingTemplate.approvedFaqs.slice(0, 3).map((faq) => (
                      <article className="faq-item" key={faq.question}>
                        <p className="faq-question">{faq.question}</p>
                        <p className="faq-answer">{faq.answer}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="routing-title">
            <div className="panel-header">
              <h2 className="panel-title" id="routing-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Route size={16} strokeWidth={1.75} />
                4. Rules and Routing
              </h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="escalationPhone">Escalation phone</label>
                  <input
                    id="escalationPhone"
                    name="escalationPhone"
                    type="tel"
                    pattern="\+?[\d\s().-]{7,20}"
                    placeholder="+1 (604) 555-0000"
                  />
                </div>
                <div className="field">
                  <label htmlFor="notificationEmail">Notification email</label>
                  <input
                    id="notificationEmail"
                    name="notificationEmail"
                    type="email"
                    placeholder="dispatch@example.com"
                  />
                </div>
                <div className="field full">
                  <label htmlFor="emergencyRules">Emergency rules (one per line)</label>
                  <textarea
                    id="emergencyRules"
                    name="emergencyRules"
                    defaultValue={roofingTemplate.emergencyRules.join("\n")}
                  />
                </div>
                <div className="field full">
                  <label htmlFor="bookingRules">Booking rules (one per line)</label>
                  <textarea id="bookingRules" name="bookingRules" defaultValue={roofingTemplate.bookingRules.join("\n")} />
                </div>
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="vapi-onboarding-title">
            <div className="panel-header">
              <h2 className="panel-title" id="vapi-onboarding-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <PhoneCall size={16} strokeWidth={1.75} />
                5. Vapi and Branding
              </h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field full">
                  <label htmlFor="vapiAssistantId">
                    Vapi assistant ID <span style={{ color: "#94a3b8", fontWeight: 400 }}>(set after creating in Vapi dashboard)</span>
                  </label>
                  <input
                    id="vapiAssistantId"
                    name="vapiAssistantId"
                    placeholder="e.g. 9267a84a-0f4f-416b-a328-1dc539f5265e"
                    style={{ fontFamily: "monospace", fontSize: 13 }}
                  />
                </div>
                <div className="field full">
                  <label htmlFor="vapiPhoneNumberId">
                    Vapi phone number ID <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    id="vapiPhoneNumberId"
                    name="vapiPhoneNumberId"
                    placeholder="e.g. pn_xxxxxxxxxxxxxxxx"
                    style={{ fontFamily: "monospace", fontSize: 13 }}
                  />
                </div>
                <div className="field">
                  <label htmlFor="brandColor">Brand color (hex)</label>
                  <input id="brandColor" name="brandColor" placeholder="#1e3a5f" />
                </div>
                <div className="field">
                  <label htmlFor="contactPhone">Contact phone (shown in emails)</label>
                  <input id="contactPhone" name="contactPhone" type="tel" pattern="\+?[\d\s().-]{7,20}" placeholder="+1 (604) 555-1234" />
                </div>
                <div className="field full">
                  <label htmlFor="logoUrl">Logo URL (HTTPS, optional)</label>
                  <input id="logoUrl" name="logoUrl" placeholder="https://…/logo.png" />
                </div>
              </div>
              <div className="button-row">
                <button
                  className="button primary"
                  type="submit"
                  disabled={submitStatus.type === "submitting"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <UserPlus size={15} strokeWidth={1.75} />
                  Create company
                </button>
              </div>
              {submitStatus.type === "success" && submitStatus.businessId ? (
                <div style={{ marginTop: 16, padding: "16px 20px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
                  <p style={{ margin: "0 0 10px", fontWeight: 700, color: "#15803d", fontSize: 14 }}>
                    ✓ Company created — {submitStatus.businessId}
                  </p>
                  {submitStatus.loginEmail && submitStatus.tempPassword ? (
                    <div style={{ margin: "0 0 14px", padding: "12px 14px", background: "#fff", border: "1px solid #bbf7d0", borderRadius: 6 }}>
                      <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.05em" }}>Client login credentials (shown once)</p>
                      <p style={{ margin: "0 0 4px", fontSize: 13, color: "#1e293b" }}>
                        Email: <strong>{submitStatus.loginEmail}</strong>
                      </p>
                      <p style={{ margin: "0 0 8px", fontSize: 13, color: "#1e293b" }}>
                        Temp password: <strong style={{ fontFamily: "monospace", background: "#f1f5f9", padding: "1px 6px", borderRadius: 4 }}>{submitStatus.tempPassword}</strong>
                      </p>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(`Email: ${submitStatus.loginEmail}\nPassword: ${submitStatus.tempPassword}`)}
                        className="button"
                        style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
                      >
                        <Copy size={13} strokeWidth={1.75} />
                        Copy credentials
                      </button>
                      <p style={{ margin: "8px 0 0", fontSize: 11, color: "#64748b" }}>Ask the client to change their password after first login.</p>
                    </div>
                  ) : (
                    <p style={{ margin: "0 0 12px", fontSize: 13, color: "#166534" }}>
                      No owner email provided — client login not provisioned.
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <a href={`/admin/businesses/${submitStatus.businessId}/config`} className="button primary" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Settings size={14} strokeWidth={1.75} />
                      Configure agent
                    </a>
                    <a href="/admin/businesses" className="button" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Building2 size={14} strokeWidth={1.75} />
                      All companies
                    </a>
                  </div>
                </div>
              ) : submitStatus.message ? (
                <p
                  className="helper-text"
                  role={submitStatus.type === "error" ? "alert" : "status"}
                  style={{ marginTop: 12, color: submitStatus.type === "error" ? "#b91c1c" : undefined }}
                >
                  {submitStatus.message}
                </p>
              ) : null}
            </div>
          </section>
        </section>

        <aside className="section-stack">
          <section className="panel" aria-labelledby="steps-title">
            <div className="panel-header">
              <h2 className="panel-title" id="steps-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ClipboardList size={16} strokeWidth={1.75} />
                Setup steps
              </h2>
            </div>
            <div className="panel-body">
              <ol className="step-list">
                {wizardSteps.map((step, index) => (
                  <li key={step}>
                    <span className="step-number">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="panel" aria-labelledby="readiness-title">
            <div className="panel-header">
              <h2 className="panel-title" id="readiness-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Rocket size={16} strokeWidth={1.75} />
                Launch readiness
              </h2>
            </div>
            <div className="panel-body">
              <div className="readiness-list">
                {readinessChecks.map((check, index) => (
                  <label className="check-row" key={check}>
                    <input type="checkbox" defaultChecked={index < 3} />
                    <span>{check}</span>
                  </label>
                ))}
              </div>
            </div>
          </section>
        </aside>
      </form>
    </>
  );
}

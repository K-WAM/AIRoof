"use client";

import { useEffect, useRef, useState } from "react";
import { PLAN_PRESETS } from "@/lib/ai/planPresets";
import { VERTICAL_TEMPLATES } from "@/lib/verticals/templates";
import { SUPPORTED_TIMEZONES } from "@/hooks/useBusinessTimezone";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
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
const lastWizardStep = wizardSteps.length - 1;

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
  const formRef = useRef<HTMLFormElement>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
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

  function moveToStep(step: number) {
    const nextStep = Math.max(0, Math.min(lastWizardStep, step));
    setCurrentStep(nextStep);
    setFurthestStep((current) => Math.max(current, nextStep));
    window.requestAnimationFrame(() => {
      formRef.current
        ?.querySelector<HTMLElement>(`[data-wizard-step="${nextStep}"]`)
        ?.focus();
    });
  }

  function goNext() {
    const currentPanel = formRef.current?.querySelector<HTMLElement>(
      `[data-wizard-step="${currentStep}"]`,
    );
    const invalidField = Array.from(
      currentPanel?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        "input, select, textarea",
      ) ?? [],
    ).find((field) => !field.checkValidity());

    if (invalidField) {
      invalidField.reportValidity();
      invalidField.focus();
      return;
    }

    moveToStep(currentStep + 1);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentStep < lastWizardStep) {
      goNext();
      return;
    }

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
      if (field instanceof HTMLElement) {
        const step = Number(field.closest<HTMLElement>("[data-wizard-step]")?.dataset.wizardStep);
        if (Number.isFinite(step)) moveToStep(step);
        window.requestAnimationFrame(() => field.focus());
      }
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

      <form
        ref={formRef}
        className="wizard-grid"
        onSubmit={handleSubmit}
        onChange={() => setDirty(true)}
        noValidate
      >
        <section className="section-stack">
          <section
            className="panel"
            aria-labelledby="profile-title"
            data-wizard-step={0}
            hidden={currentStep !== 0}
            tabIndex={-1}
          >
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

          <section
            className="panel"
            aria-labelledby="template-title"
            data-wizard-step={1}
            hidden={currentStep !== 1}
            tabIndex={-1}
          >
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

          <section
            className="panel"
            aria-labelledby="defaults-title"
            data-wizard-step={2}
            hidden={currentStep !== 2}
            tabIndex={-1}
          >
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

          <section
            className="panel"
            aria-labelledby="routing-title"
            data-wizard-step={3}
            hidden={currentStep !== 3}
            tabIndex={-1}
          >
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

          <section
            className="panel"
            aria-labelledby="vapi-onboarding-title"
            data-wizard-step={4}
            hidden={currentStep !== 4}
            tabIndex={-1}
          >
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
            </div>
          </section>

          <section
            className="panel"
            aria-labelledby="readiness-title"
            data-wizard-step={5}
            hidden={currentStep !== 5}
            tabIndex={-1}
          >
            <div className="panel-header">
              <h2 className="panel-title" id="readiness-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Rocket size={16} strokeWidth={1.75} />
                6. Launch Readiness
              </h2>
            </div>
            <div className="panel-body">
              <p style={{ margin: "0 0 14px", color: "var(--text-muted)", fontSize: 13 }}>
                Review every setup area before creating the inactive tenant. Test calls remain a post-create launch task.
              </p>
              <div className="readiness-list">
                {readinessChecks.map((check, index) => (
                  <label className="check-row" key={check}>
                    <input type="checkbox" defaultChecked={index < 3} />
                    <span>{check}</span>
                  </label>
                ))}
              </div>
              <div className="button-row">
                <button
                  className="button primary"
                  type="submit"
                  disabled={submitStatus.type === "submitting"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <UserPlus size={15} strokeWidth={1.75} />
                  {submitStatus.type === "submitting" ? "Creating company…" : "Create company"}
                </button>
              </div>
            </div>
          </section>

          <div className="button-row" style={{ justifyContent: "space-between", marginTop: 0 }}>
            <button
              className="button"
              type="button"
              onClick={() => moveToStep(currentStep - 1)}
              disabled={currentStep === 0 || submitStatus.type === "submitting"}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <ChevronLeft size={15} strokeWidth={1.75} />
              Back
            </button>
            {currentStep < lastWizardStep && (
              <button
                className="button primary"
                type="button"
                onClick={goNext}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                Next
                <ChevronRight size={15} strokeWidth={1.75} />
              </button>
            )}
          </div>

          {submitStatus.type === "success" && submitStatus.businessId ? (
            <div style={{ padding: "16px 20px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
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
              style={{ margin: 0, color: submitStatus.type === "error" ? "#b91c1c" : undefined }}
            >
              {submitStatus.message}
            </p>
          ) : null}
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
              <p
                role="status"
                aria-live="polite"
                style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700 }}
              >
                Step {currentStep + 1} of {wizardSteps.length}
              </p>
              <div
                role="progressbar"
                aria-label="Company onboarding progress"
                aria-valuemin={1}
                aria-valuemax={wizardSteps.length}
                aria-valuenow={currentStep + 1}
                style={{ height: 6, borderRadius: 999, background: "var(--surface-muted)", marginBottom: 18, overflow: "hidden" }}
              >
                <span
                  style={{
                    display: "block",
                    width: `${((currentStep + 1) / wizardSteps.length) * 100}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: "var(--accent)",
                    transition: "width 0.18s ease",
                  }}
                />
              </div>
              <ol className="step-list">
                {wizardSteps.map((step, index) => (
                  <li
                    key={step}
                    style={{ color: index === currentStep ? "var(--text)" : undefined }}
                  >
                    <span
                      className="step-number"
                      style={index <= currentStep ? { background: "var(--accent)", color: "#fff" } : undefined}
                    >
                      {index < currentStep ? <Check size={14} strokeWidth={2} /> : index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => moveToStep(index)}
                      disabled={index > furthestStep}
                      aria-current={index === currentStep ? "step" : undefined}
                      style={{
                        border: 0,
                        padding: "4px 0",
                        background: "transparent",
                        color: "inherit",
                        font: "inherit",
                        fontWeight: index === currentStep ? 700 : 500,
                        textAlign: "left",
                        cursor: index <= furthestStep ? "pointer" : "default",
                      }}
                    >
                      {step}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </aside>
      </form>
    </>
  );
}

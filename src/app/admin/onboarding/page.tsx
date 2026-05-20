"use client";

import { useState } from "react";
import { PLAN_PRESETS } from "@/lib/ai/planPresets";
import { VERTICAL_TEMPLATES } from "@/lib/verticals/templates";

const wizardSteps = [
  "Company profile",
  "Template and plan",
  "Services and FAQs",
  "Rules and routing",
  "Test calls",
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

export default function OnboardingPage() {
  const [submitStatus, setSubmitStatus] = useState<{
    type: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitStatus({ type: "submitting", message: "Creating company..." });

    const formData = new FormData(event.currentTarget);
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
        message: `Created ${result.businessId}. Continue with test calls and launch readiness.`,
      });
    } catch (error) {
      setSubmitStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to create company",
      });
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Company Onboarding</h1>
          <p className="page-subtitle">
            Create a tenant with guided defaults for industry template, AI plan,
            voice, services, rules, routing, and launch readiness.
          </p>
        </div>
        <span className="status-pill">Draft setup</span>
      </header>

      <form className="wizard-grid" onSubmit={handleSubmit}>
        <section className="section-stack">
          <section className="panel" aria-labelledby="profile-title">
            <div className="panel-header">
              <h2 className="panel-title" id="profile-title">
                1. Company Profile
              </h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="businessName">Business name</label>
                  <input id="businessName" name="businessName" placeholder="Apex Roofing" />
                </div>
                <div className="field">
                  <label htmlFor="businessId">Business ID</label>
                  <input id="businessId" name="businessId" placeholder="apex-roofing" />
                </div>
                <div className="field">
                  <label htmlFor="ownerEmail">Owner email</label>
                  <input id="ownerEmail" name="ownerEmail" placeholder="owner@example.com" />
                </div>
                <div className="field">
                  <label htmlFor="phoneNumber">Main phone</label>
                  <input id="phoneNumber" name="phoneNumber" placeholder="+1 (604) 555-1234" />
                </div>
                <div className="field full">
                  <label htmlFor="serviceArea">Service area</label>
                  <textarea
                    id="serviceArea"
                    name="serviceArea"
                    placeholder="Vancouver, Burnaby, New Westminster, Coquitlam"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="template-title">
            <div className="panel-header">
              <h2 className="panel-title" id="template-title">
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
                    <option value="verse">Verse - warm subscriber voice</option>
                    <option value="sage">Sage - calm triage voice</option>
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
              <h2 className="panel-title" id="defaults-title">
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
              <h2 className="panel-title" id="routing-title">
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
                    placeholder="+1 (604) 555-0000"
                  />
                </div>
                <div className="field">
                  <label htmlFor="notificationEmail">Notification email</label>
                  <input
                    id="notificationEmail"
                    name="notificationEmail"
                    placeholder="dispatch@example.com"
                  />
                </div>
                <div className="field full">
                  <label htmlFor="emergencyRules">Emergency rules</label>
                  <textarea
                    id="emergencyRules"
                    defaultValue={roofingTemplate.emergencyRules.join("\n")}
                  />
                </div>
                <div className="field full">
                  <label htmlFor="bookingRules">Booking rules</label>
                  <textarea id="bookingRules" defaultValue={roofingTemplate.bookingRules.join("\n")} />
                </div>
              </div>
              <div className="button-row">
                <button className="button" type="button">
                  Save draft
                </button>
                <button
                  className="button primary"
                  type="submit"
                  disabled={submitStatus.type === "submitting"}
                >
                  Create company
                </button>
              </div>
              {submitStatus.message ? (
                <p
                  className="helper-text"
                  role={submitStatus.type === "error" ? "alert" : "status"}
                  style={{ marginTop: 12 }}
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
              <h2 className="panel-title" id="steps-title">
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
              <h2 className="panel-title" id="readiness-title">
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

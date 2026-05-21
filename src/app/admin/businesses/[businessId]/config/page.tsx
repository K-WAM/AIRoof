"use client";

import { use, useState } from "react";
import { PLAN_PRESETS } from "@/lib/ai/planPresets";
import { VERTICAL_TEMPLATES } from "@/lib/verticals/templates";

const roofingTemplate = VERTICAL_TEMPLATES.roofing;

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
  const [submitStatus, setSubmitStatus] = useState<{
    type: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitStatus({ type: "submitting", message: "Saving config..." });

    const formData = new FormData(event.currentTarget);
    const industry = String(formData.get("industry") || "roofing");
    const activeStatus = String(formData.get("active") || "draft");

    const payload = {
      businessName: String(formData.get("businessName") || "").trim(),
      industry,
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
      liveModel: String(formData.get("liveModel") || "").trim(),
      backOfficeModel: String(formData.get("backOfficeModel") || "").trim(),
      agentVoice: String(formData.get("voice") || "").trim(),
      agentTone: String(formData.get("tone") || "").trim(),
      temperature: Number(formData.get("temperature") || 0.5),
      maxTokens: Number(formData.get("maxTokens") || 150),
      emergencyRules: String(formData.get("emergencyRules") || "")
        .split("\n")
        .map((rule) => rule.trim())
        .filter(Boolean),
      bookingRules: String(formData.get("bookingRules") || "")
        .split("\n")
        .map((rule) => rule.trim())
        .filter(Boolean),
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

      setSubmitStatus({
        type: "success",
        message: `Saved config for ${result.businessId}.`,
      });
    } catch (error) {
      setSubmitStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to save config",
      });
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Company Config</h1>
          <p className="page-subtitle">
            Configure tenant setup, AI model behavior, voice, routing, rules,
            and launch readiness for <strong>{businessId}</strong>.
          </p>
        </div>
        <span className="status-pill">Draft changes</span>
      </header>

      <form className="config-grid" onSubmit={handleSubmit}>
        <div className="section-stack">
          <section className="panel" aria-labelledby="profile-config-title">
            <div className="panel-header">
              <h2 className="panel-title" id="profile-config-title">
                Business Profile
              </h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="businessName">Business name</label>
                  <input id="businessName" name="businessName" defaultValue="Apex Roofing" />
                </div>
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
                  <label htmlFor="active">Status</label>
                  <select id="active" name="active" defaultValue="active">
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="serviceArea">Service area</label>
                  <input
                    id="serviceArea"
                    name="serviceArea"
                    defaultValue="Vancouver, Burnaby, New Westminster, Coquitlam"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="ai-config-title">
            <div className="panel-header">
              <h2 className="panel-title" id="ai-config-title">
                AI Model and Voice
              </h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="planTier">Plan tier</label>
                  <select id="planTier" name="planTier" defaultValue="standard">
                    {Object.values(PLAN_PRESETS).map((preset) => (
                      <option value={preset.planTier} key={preset.planTier}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="liveModel">Live call model</label>
                  <select id="liveModel" name="liveModel" defaultValue="gpt-4o-mini">
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                    <option value="gpt-4.1">gpt-4.1</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="backOfficeModel">Back-office model</label>
                  <select id="backOfficeModel" name="backOfficeModel" defaultValue="deepseek-chat">
                    <option value="deepseek-chat">deepseek-chat</option>
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                    <option value="gpt-4.1-mini">gpt-4.1-mini</option>
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
                  <label htmlFor="tone">Agent tone</label>
                  <select id="tone" name="tone" defaultValue="calm, concise, service-focused">
                    <option value="calm, concise, service-focused">
                      Calm, concise, service-focused
                    </option>
                    <option value="friendly and conversational">Friendly and conversational</option>
                    <option value="direct emergency triage">Direct emergency triage</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="temperature">Temperature</label>
                  <select id="temperature" name="temperature" defaultValue="0.5">
                    <option value="0.2">0.2 - strict</option>
                    <option value="0.5">0.5 - balanced</option>
                    <option value="0.7">0.7 - flexible</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="maxTokens">Response length</label>
                  <select id="maxTokens" name="maxTokens" defaultValue="150">
                    <option value="100">Short</option>
                    <option value="150">Standard</option>
                    <option value="250">Detailed</option>
                  </select>
                </div>
                <label className="check-row">
                  <input name="applyTemplateDefaults" type="checkbox" />
                  <span>Reapply selected industry template defaults</span>
                </label>
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="services-config-title">
            <div className="panel-header">
              <h2 className="panel-title" id="services-config-title">
                Services and Rules
              </h2>
            </div>
            <div className="panel-body">
              <div className="rule-section">
                <div className="rule-group">
                  <h3 className="rule-heading">Approved services</h3>
                  <div className="chip-list">
                    {roofingTemplate.approvedServices.map((service) => (
                      <span className="chip" key={service}>
                        {service}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="emergencyRules">Emergency rules</label>
                  <textarea
                    id="emergencyRules"
                    name="emergencyRules"
                    defaultValue={roofingTemplate.emergencyRules.join("\n")}
                  />
                </div>
                <div className="field">
                  <label htmlFor="bookingRules">Booking rules</label>
                  <textarea
                    id="bookingRules"
                    name="bookingRules"
                    defaultValue={roofingTemplate.bookingRules.join("\n")}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="section-stack">
          <section className="panel" aria-labelledby="routing-title">
            <div className="panel-header">
              <h2 className="panel-title" id="routing-title">
                Routing
              </h2>
            </div>
            <div className="panel-body">
              <div className="contact-card">
                <div className="field">
                  <label htmlFor="phoneNumber">Main phone</label>
                  <input id="phoneNumber" name="phoneNumber" defaultValue="+1 (604) 555-1234" />
                </div>
                <div className="field">
                  <label htmlFor="calendarProvider">Calendar provider</label>
                  <select id="calendarProvider" name="calendarProvider" defaultValue="mock">
                    <option value="mock">Mock scheduling</option>
                    <option value="google">Google Calendar</option>
                    <option value="calendly">Calendly</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="escalationPhone">Escalation phone</label>
                  <input
                    id="escalationPhone"
                    name="escalationPhone"
                    defaultValue="+1 (604) 555-0000"
                  />
                </div>
                <div className="field">
                  <label htmlFor="notificationEmail">Notification email</label>
                  <input
                    id="notificationEmail"
                    name="notificationEmail"
                    defaultValue="dispatch@apexroofing.local"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="readiness-title">
            <div className="panel-header">
              <h2 className="panel-title" id="readiness-title">
                Launch Readiness
              </h2>
            </div>
            <div className="panel-body">
              <div className="readiness-list">
                {readinessChecks.map((check, index) => (
                  <label className="check-row" key={check.key}>
                    <input name={check.key} type="checkbox" defaultChecked={index < 4} />
                    <span>{check.label}</span>
                  </label>
                ))}
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
                  Save config
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
        </aside>
      </form>
    </>
  );
}

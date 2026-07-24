"use client";

import { use, useEffect, useRef, useState } from "react";
import { PLAN_PRESETS } from "@/lib/ai/planPresets";
import { VERTICAL_TEMPLATES } from "@/lib/verticals/templates";
import { SUPPORTED_TIMEZONES } from "@/hooks/useBusinessTimezone";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import {
  ArrowLeft,
  Bot,
  Building2,
  Copy,
  KeyRound,
  ListChecks,
  Palette,
  PhoneCall,
  Receipt,
  Rocket,
  Route,
  Save,
  Settings,
  UserPlus,
} from "lucide-react";

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
  laborRate?: { defaultHourlyRate?: number };
  defaultTaxRate?: number;
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s().-]{7,20}$/;

export default function AdminBusinessConfigPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = use(params);
  const [biz, setBiz] = useState<BizData | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    type: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });

  const [loginEmail, setLoginEmail] = useState("");
  const [provisionStatus, setProvisionStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message: string;
    tempPassword?: string;
  }>({ type: "idle", message: "" });
  const loginEmailRef = useRef<HTMLInputElement>(null);

  async function provisionLogin() {
    if (!EMAIL_PATTERN.test(loginEmail.trim())) {
      setProvisionStatus({ type: "error", message: "Enter a valid owner email." });
      loginEmailRef.current?.focus();
      return;
    }
    setProvisionStatus({ type: "loading", message: "Creating login…" });
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/provision-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerEmail: loginEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error("Login provisioning failed");
      setProvisionStatus({ type: "success", message: "Login provisioned!", tempPassword: data.tempPassword });
    } catch {
      setProvisionStatus({ type: "error", message: "The client login could not be provisioned. Try again." });
    }
  }

  useEffect(() => {
    fetch(`/api/admin/businesses/${businessId}/config`)
      .then((r) => {
        if (!r.ok) throw new Error("Config request failed");
        return r.json();
      })
      .then((data) => {
        setBiz(data.business ?? null);
        setOnboarding(data.onboarding ?? null);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [businessId]);

  useEffect(() => {
    if (!dirty) return;
    const message = "You have unsaved configuration changes. Leave this page?";
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
      { name: "phoneNumber", valid: PHONE_PATTERN.test(String(formData.get("phoneNumber") || "").trim()), message: "Enter a valid main phone number." },
      { name: "notificationEmail", valid: EMAIL_PATTERN.test(String(formData.get("notificationEmail") || "").trim()), message: "Enter a valid notification email." },
      { name: "escalationPhone", valid: !String(formData.get("escalationPhone") || "").trim() || PHONE_PATTERN.test(String(formData.get("escalationPhone") || "").trim()), message: "Enter a valid escalation phone number." },
      { name: "contactPhone", valid: !String(formData.get("contactPhone") || "").trim() || PHONE_PATTERN.test(String(formData.get("contactPhone") || "").trim()), message: "Enter a valid public contact phone." },
      { name: "contactEmail", valid: !String(formData.get("contactEmail") || "").trim() || EMAIL_PATTERN.test(String(formData.get("contactEmail") || "").trim()), message: "Enter a valid public contact email." },
    ];
    const invalid = validationChecks.find((check) => !check.valid);
    if (invalid) {
      setSubmitStatus({ type: "error", message: invalid.message });
      const field = event.currentTarget.elements.namedItem(invalid.name);
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    setSubmitStatus({ type: "submitting", message: "Saving config..." });

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
      // Pricing
      laborRate: formData.get("defaultHourlyLaborRate") !== ""
        ? { defaultHourlyRate: Number(formData.get("defaultHourlyLaborRate")) }
        : undefined,
      defaultTaxRate: formData.get("defaultTaxRate") !== ""
        ? Number(formData.get("defaultTaxRate"))
        : undefined,
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
      setDirty(false);
    } catch {
      setSubmitStatus({
        type: "error",
        message: "The configuration could not be saved. Review the form and try again.",
      });
    }
  }

  if (loading) return <PageSkeleton rows={6} />;
  if (loadError) {
    return (
      <PageError
        message="The company configuration could not be loaded. No saved settings are being shown."
        onRetry={() => window.location.reload()}
      />
    );
  }
  if (!biz) {
    return (
      <PageError
        title="Business not found"
        message="This company configuration is not available."
      />
    );
  }

  const serviceAreaStr = Array.isArray(biz.serviceArea)
    ? biz.serviceArea.join(", ")
    : (biz.serviceArea ?? "");

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Settings size={20} strokeWidth={1.75} />
            Company Config
          </h1>
          <p className="page-subtitle">
            Edit agent settings, voice, routing, and Vapi IDs for{" "}
            <strong>{biz.businessName}</strong> ({businessId}).
          </p>
        </div>
        <a className="button" href="/admin/businesses" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <ArrowLeft size={15} strokeWidth={1.75} />
          All companies
        </a>
      </header>

      <form
        className="config-grid"
        onSubmit={handleSubmit}
        onChange={(event) => {
          if ((event.target as HTMLInputElement).name !== "loginEmail") setDirty(true);
        }}
      >
        <div className="section-stack">

          {/* ─── Business Profile ─── */}
          <section className="panel" aria-labelledby="profile-config-title">
            <div className="panel-header">
              <h2 className="panel-title" id="profile-config-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Building2 size={16} strokeWidth={1.75} />
                Business Profile
              </h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="businessName">Business name</label>
                  <input id="businessName" name="businessName" required defaultValue={biz.businessName} />
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
                    {SUPPORTED_TIMEZONES.map((tz) => (
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
              <h2 className="panel-title" id="vapi-config-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <PhoneCall size={16} strokeWidth={1.75} />
                Vapi Integration
              </h2>
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
              <h2 className="panel-title" id="ai-config-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Bot size={16} strokeWidth={1.75} />
                AI Model and Voice
              </h2>
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
              <h2 className="panel-title" id="services-config-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ListChecks size={16} strokeWidth={1.75} />
                Services and Rules
              </h2>
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

          {/* ─── Client Login ─── */}
          <section className="panel" aria-labelledby="login-provision-title">
            <div className="panel-header">
              <h2 className="panel-title" id="login-provision-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <KeyRound size={16} strokeWidth={1.75} />
                Client Login
              </h2>
            </div>
            <div className="panel-body">
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px" }}>
                Provision or reset login access for this company&apos;s owner. Generates a temp password they use to log in at{" "}
                <strong>ai-roof.vercel.app/login</strong>.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  id="loginEmail"
                  name="loginEmail"
                  ref={loginEmailRef}
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="owner@company.com"
                  style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, outline: "none" }}
                />
                <button
                  type="button"
                  className="button primary"
                  onClick={provisionLogin}
                  disabled={provisionStatus.type === "loading" || !loginEmail.trim()}
                  style={{ fontSize: 13, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}
                >
                  <UserPlus size={14} strokeWidth={1.75} />
                  {provisionStatus.type === "loading" ? "Creating…" : "Provision Login"}
                </button>
              </div>
              {provisionStatus.type === "success" && provisionStatus.tempPassword && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8 }}>
                  <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 13, color: "#15803d" }}>✓ Login ready — share these credentials once:</p>
                  <p style={{ margin: "0 0 2px", fontSize: 13, color: "#166534" }}>Email: <strong>{loginEmail}</strong></p>
                  <p style={{ margin: 0, fontSize: 13, color: "#166534", display: "flex", alignItems: "center", gap: 8 }}>
                    Password: <strong style={{ fontFamily: "monospace", letterSpacing: "0.05em" }}>{provisionStatus.tempPassword}</strong>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(provisionStatus.tempPassword!)}
                      style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #86efac", borderRadius: 4, background: "#fff", cursor: "pointer", color: "#15803d", display: "inline-flex", alignItems: "center", gap: 4 }}
                    >
                      <Copy size={11} strokeWidth={1.75} />
                      Copy
                    </button>
                  </p>
                </div>
              )}
              {provisionStatus.type === "error" && (
                <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, color: "#b91c1c" }}>{provisionStatus.message}</p>
              )}
            </div>
          </section>

          {/* ─── Routing ─── */}
          <section className="panel" aria-labelledby="routing-title">
            <div className="panel-header">
              <h2 className="panel-title" id="routing-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Route size={16} strokeWidth={1.75} />
                Routing
              </h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="phoneNumber">Main phone</label>
                  <input id="phoneNumber" name="phoneNumber" type="tel" required pattern="\+?[\d\s().-]{7,20}" defaultValue={biz.phoneNumber ?? ""} />
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
                  <input id="escalationPhone" name="escalationPhone" type="tel" pattern="\+?[\d\s().-]{7,20}" defaultValue={biz.escalationPhone ?? ""} />
                </div>
                <div className="field">
                  <label htmlFor="notificationEmail">Notification email</label>
                  <input id="notificationEmail" name="notificationEmail" type="email" required defaultValue={biz.notificationEmail ?? ""} />
                </div>
              </div>
            </div>
          </section>

          {/* ─── Branding ─── */}
          <section className="panel" aria-labelledby="branding-title">
            <div className="panel-header">
              <h2 className="panel-title" id="branding-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Palette size={16} strokeWidth={1.75} />
                Branding
              </h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="brandColor">Brand color (hex)</label>
                  <input id="brandColor" name="brandColor" placeholder="#1e3a5f" defaultValue={biz.brandColor ?? ""} />
                </div>
                <div className="field">
                  <label htmlFor="contactPhone">Contact phone (public)</label>
                  <input id="contactPhone" name="contactPhone" type="tel" pattern="\+?[\d\s().-]{7,20}" defaultValue={biz.contactPhone ?? ""} />
                </div>
                <div className="field full">
                  <label htmlFor="logoUrl">Logo URL (HTTPS)</label>
                  <input id="logoUrl" name="logoUrl" placeholder="https://…/logo.png" defaultValue={biz.logoUrl ?? ""} />
                </div>
                <div className="field full">
                  <label htmlFor="contactEmail">Contact email (public)</label>
                  <input id="contactEmail" name="contactEmail" type="email" defaultValue={biz.contactEmail ?? ""} />
                </div>
                <div className="field full">
                  <label htmlFor="websiteUrl">Website URL</label>
                  <input id="websiteUrl" name="websiteUrl" placeholder="https://…" defaultValue={biz.websiteUrl ?? ""} />
                </div>
              </div>
            </div>
          </section>

          {/* ─── Job Pricing ─── */}
          <section className="panel" aria-labelledby="pricing-title">
            <div className="panel-header">
              <h2 className="panel-title" id="pricing-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Receipt size={16} strokeWidth={1.75} />
                Job Pricing
              </h2>
            </div>
            <div className="panel-body">
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px" }}>
                Used when generating invoices from field updates. Field crews can voice these values, but setting defaults here ensures accuracy when not stated.
              </p>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="defaultHourlyLaborRate">Default labor rate ($/hr)</label>
                  <input
                    id="defaultHourlyLaborRate"
                    name="defaultHourlyLaborRate"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="65"
                    defaultValue={biz.laborRate?.defaultHourlyRate ?? ""}
                  />
                </div>
                <div className="field">
                  <label htmlFor="defaultTaxRate">Default tax rate (%)</label>
                  <input
                    id="defaultTaxRate"
                    name="defaultTaxRate"
                    type="number"
                    min="0"
                    max="30"
                    step="0.01"
                    placeholder="0"
                    defaultValue={biz.defaultTaxRate ?? ""}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ─── Launch Readiness ─── */}
          <section className="panel" aria-labelledby="readiness-title">
            <div className="panel-header">
              <h2 className="panel-title" id="readiness-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Rocket size={16} strokeWidth={1.75} />
                Launch Readiness
              </h2>
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
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <Save size={15} strokeWidth={1.75} />
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

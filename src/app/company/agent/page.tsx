"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useBusinessId } from "@/hooks/useBusinessId";
import type { BusinessConfig } from "@/types";

export default function CompanyAgentPage() {
  const businessId = useBusinessId();

  const [config, setConfig] = useState<BusinessConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !businessId) return;
    getDoc(doc(db, "businesses", businessId))
      .then((snap) => {
        if (snap.exists()) setConfig(snap.data() as BusinessConfig);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [businessId]);

  if (loading) return <div style={{ padding: 32, color: "#666" }}>Loading agent settings…</div>;

  if (!config) return <div style={{ padding: 32, color: "#888" }}>Agent config not found.</div>;

  const routingRows = [
    ["Agent name", config.agentName ?? "Roofus"],
    ["Role", config.agentIdentity ?? "Receptionist"],
    ["Plan tier", config.planTier ?? "standard"],
    ["Live call model", config.liveModel ?? "gpt-4o-mini"],
    ["Back-office model", config.backOfficeModel ?? "deepseek-chat"],
    ["Voice", config.agentVoice ?? "alloy"],
    ["Tone", config.agentTone ?? "—"],
    ["Temperature", String(config.temperature ?? 0.5)],
    ["Max tokens", String(config.maxTokens ?? 150)],
    ["Escalation phone", config.escalationPhone ?? "—"],
    ["Notification email", config.notificationEmail ?? "—"],
    ["Calendar provider", config.calendarProvider ?? "mock"],
    ["Greeting", config.greeting ?? "—"],
  ];

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Agent Settings</h1>
          <p className="page-subtitle">
            Review the approved services, FAQs, rules, and escalation contacts
            Roofus uses when answering calls for this company.
          </p>
        </div>
        <span className="status-pill">{config.active ? "Active" : "Inactive"}</span>
      </header>

      <div className="settings-grid">
        <section className="panel" aria-labelledby="rules-title">
          <div className="panel-header">
            <h2 className="panel-title" id="rules-title">Agent Rules</h2>
          </div>
          <div className="panel-body">
            <div className="rule-section">
              <div className="rule-group">
                <h3 className="rule-heading">Approved services</h3>
                <div className="chip-list">
                  {config.approvedServices.map((s) => (
                    <span className="chip" key={s}>{s}</span>
                  ))}
                </div>
              </div>

              <div className="rule-group">
                <h3 className="rule-heading">Emergency rules</h3>
                <div className="queue-list">
                  {config.emergencyRules.map((rule) => (
                    <div className="queue-item" key={rule}>
                      <p className="queue-title">{rule}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rule-group">
                <h3 className="rule-heading">Booking rules</h3>
                <div className="queue-list">
                  {config.bookingRules.map((rule) => (
                    <div className="queue-item" key={rule}>
                      <p className="queue-title">{rule}</p>
                    </div>
                  ))}
                </div>
              </div>

              {config.disallowedTopics && config.disallowedTopics.length > 0 && (
                <div className="rule-group">
                  <h3 className="rule-heading">Disallowed topics</h3>
                  <div className="chip-list">
                    {config.disallowedTopics.map((t) => (
                      <span className="chip" key={t}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="panel" aria-labelledby="contact-title">
          <div className="panel-header">
            <h2 className="panel-title" id="contact-title">Routing & Config</h2>
          </div>
          <div className="panel-body">
            <div className="contact-card">
              {routingRows.map(([label, value]) => (
                <div className="readonly-field" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <section className="panel" aria-labelledby="faq-title" style={{ marginTop: 20 }}>
        <div className="panel-header">
          <h2 className="panel-title" id="faq-title">Approved FAQs</h2>
        </div>
        <div className="panel-body">
          {config.approvedFaqs.length === 0 ? (
            <p style={{ color: "#888", fontSize: 14 }}>No approved FAQs configured.</p>
          ) : (
            <div className="faq-list">
              {config.approvedFaqs.map((faq) => (
                <article className="faq-item" key={faq.question}>
                  <p className="faq-question">{faq.question}</p>
                  <p className="faq-answer">{faq.answer}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

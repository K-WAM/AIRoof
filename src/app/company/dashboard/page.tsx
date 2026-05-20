const metrics = [
  { label: "Calls today", value: "18" },
  { label: "New leads", value: "6" },
  { label: "Escalations", value: "2" },
  { label: "Upcoming inspections", value: "4" },
];

const leadQueue = [
  {
    name: "Maria Chen",
    detail: "Active leak over kitchen, Vancouver",
    meta: "Captured 8 minutes ago from after-hours call",
    tag: "Urgent",
    urgent: true,
  },
  {
    name: "David Brooks",
    detail: "Roof inspection request, Burnaby",
    meta: "AI collected address and preferred morning appointment",
    tag: "New lead",
    urgent: false,
  },
  {
    name: "Samir Patel",
    detail: "Shingle replacement estimate, Coquitlam",
    meta: "Caller asked about warranty and wants callback today",
    tag: "Follow up",
    urgent: false,
  },
];

const agentSettings = [
  ["Agent status", "Active"],
  ["Phone routing", "Twilio number mapped"],
  ["Calendar", "Mock scheduling"],
  ["Escalation", "+1 (604) 555-0000"],
  ["Approved services", "4 services configured"],
  ["FAQs", "4 approved answers"],
];

export default function CompanyDashboardPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Today&apos;s Work</h1>
          <p className="page-subtitle">
            Review captured calls, urgent roofing leads, appointment requests,
            and the agent settings that affect this company.
          </p>
        </div>
        <span className="status-pill">Agent active</span>
      </header>

      <section className="metric-grid" aria-label="Today summary">
        {metrics.map((metric) => (
          <article className="metric" key={metric.label}>
            <p className="metric-label">{metric.label}</p>
            <p className="metric-value">{metric.value}</p>
          </article>
        ))}
      </section>

      <div className="ops-grid">
        <section className="panel" aria-labelledby="queue-title">
          <div className="panel-header">
            <h2 className="panel-title" id="queue-title">
              Lead Queue
            </h2>
          </div>
          <div className="panel-body">
            <div className="queue-list">
              {leadQueue.map((lead) => (
                <article className="queue-item" key={lead.name}>
                  <div className="queue-topline">
                    <p className="queue-title">{lead.name}</p>
                    <span className={lead.urgent ? "tag urgent" : "tag"}>{lead.tag}</span>
                  </div>
                  <p className="queue-meta">{lead.detail}</p>
                  <p className="queue-meta">{lead.meta}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <aside className="panel" aria-labelledby="agent-title">
          <div className="panel-header">
            <h2 className="panel-title" id="agent-title">
              Agent Setup
            </h2>
          </div>
          <div className="panel-body">
            <div className="settings-list">
              {agentSettings.map(([label, value]) => (
                <div className="settings-row" key={label}>
                  <p>{label}</p>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

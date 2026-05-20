const leads = [
  {
    name: "Maria Chen",
    phone: "+1 (604) 555-0198",
    address: "1428 W 12th Ave, Vancouver",
    service: "Emergency leak repair",
    urgency: "Urgent",
    status: "New",
    source: "After-hours call",
    captured: "8 minutes ago",
    selected: true,
  },
  {
    name: "David Brooks",
    phone: "+1 (604) 555-0134",
    address: "88 Parker St, Burnaby",
    service: "Roof inspection",
    urgency: "Normal",
    status: "Contact today",
    source: "Inbound call",
    captured: "31 minutes ago",
    selected: false,
  },
  {
    name: "Samir Patel",
    phone: "+1 (604) 555-0107",
    address: "219 Foster Ave, Coquitlam",
    service: "Shingle replacement estimate",
    urgency: "Normal",
    status: "Waiting callback",
    source: "Missed-call capture",
    captured: "1 hour ago",
    selected: false,
  },
  {
    name: "Leah Morgan",
    phone: "+1 (604) 555-0181",
    address: "54 Royal Ave, New Westminster",
    service: "Metal roofing quote",
    urgency: "Low",
    status: "Booked",
    source: "AI receptionist",
    captured: "Yesterday",
    selected: false,
  },
];

const selectedLead = leads[0];

const timeline = [
  {
    copy: "AI classified the call as emergency due to active water entry.",
    time: "8 minutes ago",
  },
  {
    copy: "Caller provided address, phone number, leak location, and availability.",
    time: "7 minutes ago",
  },
  {
    copy: "Escalation prepared for dispatcher follow-up.",
    time: "6 minutes ago",
  },
];

export default function CompanyLeadsPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle">
            Triage captured roofing calls, prioritize urgent leaks, and move
            qualified homeowners into callbacks or inspections.
          </p>
        </div>
        <span className="status-pill">6 need review</span>
      </header>

      <div className="toolbar">
        <div className="segmented-control" aria-label="Lead status filter">
          <button className="segment" type="button" aria-pressed="true">
            Needs review
          </button>
          <button className="segment" type="button" aria-pressed="false">
            Urgent
          </button>
          <button className="segment" type="button" aria-pressed="false">
            Booked
          </button>
          <button className="segment" type="button" aria-pressed="false">
            Closed
          </button>
        </div>
        <input
          className="search-input"
          type="search"
          placeholder="Search name, phone, address"
          aria-label="Search leads"
        />
      </div>

      <div className="lead-workspace">
        <section className="panel" aria-labelledby="lead-queue-title">
          <div className="panel-header">
            <h2 className="panel-title" id="lead-queue-title">
              Follow-up Queue
            </h2>
          </div>
          <div className="panel-body">
            <div className="queue-list">
              {leads.map((lead) => (
                <article
                  className="lead-card"
                  key={lead.phone}
                  aria-selected={lead.selected}
                >
                  <div className="lead-title-row">
                    <div>
                      <p className="lead-name">{lead.name}</p>
                      <p className="lead-phone">{lead.phone}</p>
                    </div>
                    <span className={lead.urgency === "Urgent" ? "tag urgent" : "tag"}>
                      {lead.urgency}
                    </span>
                  </div>
                  <div className="lead-detail-grid">
                    <div className="detail-block">
                      <span className="detail-label">Service</span>
                      <span className="detail-value">{lead.service}</span>
                    </div>
                    <div className="detail-block">
                      <span className="detail-label">Status</span>
                      <span className="detail-value">{lead.status}</span>
                    </div>
                    <div className="detail-block">
                      <span className="detail-label">Address</span>
                      <span className="detail-value">{lead.address}</span>
                    </div>
                    <div className="detail-block">
                      <span className="detail-label">Source</span>
                      <span className="detail-value">{lead.source}</span>
                    </div>
                  </div>
                  <p className="queue-meta">Captured {lead.captured}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <aside className="panel" aria-labelledby="selected-lead-title">
          <div className="panel-header">
            <h2 className="panel-title" id="selected-lead-title">
              Lead Detail
            </h2>
          </div>
          <div className="panel-body">
            <div className="lead-title-row">
              <div>
                <p className="lead-name">{selectedLead.name}</p>
                <p className="lead-phone">{selectedLead.phone}</p>
              </div>
              <span className="tag urgent">Urgent</span>
            </div>

            <div className="lead-detail-grid" style={{ marginTop: 16 }}>
              <div className="detail-block">
                <span className="detail-label">Roof issue</span>
                <span className="detail-value">Water leaking over kitchen</span>
              </div>
              <div className="detail-block">
                <span className="detail-label">Preferred time</span>
                <span className="detail-value">ASAP today</span>
              </div>
              <div className="detail-block">
                <span className="detail-label">Address</span>
                <span className="detail-value">{selectedLead.address}</span>
              </div>
              <div className="detail-block">
                <span className="detail-label">Next action</span>
                <span className="detail-value">Dispatcher callback</span>
              </div>
            </div>

            <div className="lead-actions" style={{ marginTop: 18 }}>
              <button className="button primary" type="button">
                Mark contacted
              </button>
              <button className="button" type="button">
                Book inspection
              </button>
              <button className="button" type="button">
                View call
              </button>
            </div>

            <div style={{ marginTop: 22 }}>
              <h3 className="panel-title">Call Timeline</h3>
              <div className="timeline" style={{ marginTop: 14 }}>
                {timeline.map((item) => (
                  <div className="timeline-item" key={item.copy}>
                    <span className="timeline-dot" aria-hidden="true" />
                    <div>
                      <p className="timeline-copy">{item.copy}</p>
                      <p className="timeline-time">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

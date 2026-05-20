const calls = [
  {
    caller: "Maria Chen",
    phone: "+1 (604) 555-0198",
    time: "8 minutes ago",
    category: "Emergency",
    status: "Escalated",
    selected: true,
  },
  {
    caller: "David Brooks",
    phone: "+1 (604) 555-0134",
    time: "31 minutes ago",
    category: "Scheduling",
    status: "Lead created",
    selected: false,
  },
  {
    caller: "Unknown caller",
    phone: "+1 (604) 555-0112",
    time: "52 minutes ago",
    category: "Off-topic",
    status: "Rejected",
    selected: false,
  },
  {
    caller: "Leah Morgan",
    phone: "+1 (604) 555-0181",
    time: "Yesterday",
    category: "Service question",
    status: "Answered",
    selected: false,
  },
];

const transcript = [
  {
    role: "Caller",
    text: "Hi, we have water coming through the ceiling near the kitchen light.",
  },
  {
    role: "Agent",
    text: "I can help with that. Is the water actively coming in right now, and are there any electrical hazards?",
  },
  {
    role: "Caller",
    text: "Yes, it is still dripping. We put a bucket down and turned off the light.",
  },
  {
    role: "Agent",
    text: "I will mark this as urgent and get the roofing team alerted. Can I confirm your address and best callback number?",
  },
];

const actions = [
  ["Classification", "Emergency"],
  ["Lead", "Created"],
  ["Escalation", "Prepared"],
  ["OpenAI call", "Allowed"],
];

export default function CompanyCallsPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Calls</h1>
          <p className="page-subtitle">
            Review call outcomes, transcripts, AI summaries, and the actions
            the receptionist took for each roofing inquiry.
          </p>
        </div>
        <span className="status-pill">18 today</span>
      </header>

      <div className="toolbar">
        <div className="segmented-control" aria-label="Call filter">
          <button className="segment" type="button" aria-pressed="true">
            All
          </button>
          <button className="segment" type="button" aria-pressed="false">
            Emergencies
          </button>
          <button className="segment" type="button" aria-pressed="false">
            Leads
          </button>
          <button className="segment" type="button" aria-pressed="false">
            Off-topic
          </button>
        </div>
        <input
          className="search-input"
          type="search"
          placeholder="Search caller, phone, summary"
          aria-label="Search calls"
        />
      </div>

      <div className="call-workspace">
        <section className="panel" aria-labelledby="call-list-title">
          <div className="panel-header">
            <h2 className="panel-title" id="call-list-title">
              Call History
            </h2>
          </div>
          <div className="panel-body">
            <div className="call-list">
              {calls.map((call) => (
                <article
                  className="call-row"
                  key={`${call.phone}-${call.time}`}
                  aria-selected={call.selected}
                >
                  <div className="call-row-header">
                    <div>
                      <p className="call-title">{call.caller}</p>
                      <p className="call-subtitle">{call.phone}</p>
                    </div>
                    <span className={call.category === "Emergency" ? "tag urgent" : "tag"}>
                      {call.category}
                    </span>
                  </div>
                  <p className="call-subtitle">
                    {call.status} · {call.time}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="call-detail-title">
          <div className="panel-header">
            <h2 className="panel-title" id="call-detail-title">
              Call Detail
            </h2>
          </div>
          <div className="panel-body">
            <div className="summary-block">
              <p>
                <strong>AI summary:</strong> Caller reported active water entry
                over the kitchen. Agent confirmed urgency, collected contact
                details, created a lead, and prepared escalation for dispatcher
                follow-up.
              </p>
              <div className="action-list">
                {actions.map(([label, value]) => (
                  <div className="action-row" key={label}>
                    <span>{label}</span>
                    <span className="tag success">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="transcript" aria-label="Call transcript">
              {transcript.map((message, index) => (
                <article
                  className={message.role === "Agent" ? "message agent" : "message"}
                  key={`${message.role}-${index}`}
                >
                  <p className="message-role">{message.role}</p>
                  <p className="message-text">{message.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

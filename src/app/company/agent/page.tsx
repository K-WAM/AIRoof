const services = [
  "Roof inspections and assessments",
  "Shingle replacement and repairs",
  "Metal roofing installation",
  "Emergency water leak repairs",
];

const emergencyRules = [
  "Active water entry, leak, or flooding escalates immediately",
  "Electrical hazards, fire damage, or safety risk escalates immediately",
  "Urgent caller intent receives same-day follow-up priority",
];

const bookingRules = [
  "Only book appointments during business hours",
  "Minimum 24-hour notice for non-emergency appointments",
  "Collect name, phone, service type, and address before confirming",
];

const faqs = [
  {
    question: "Do you offer emergency services?",
    answer:
      "Yes, we can typically respond to emergency calls same-day. Please call us immediately if you have water damage or a leak.",
  },
  {
    question: "What areas do you service?",
    answer:
      "We service Vancouver, Burnaby, New Westminster, and Coquitlam. Call us to confirm your address.",
  },
  {
    question: "How much does an inspection cost?",
    answer:
      "Inspections are $150 and include a written report. That fee is credited toward any repair quote we provide.",
  },
];

const faqSuggestions = [
  {
    question: "Can you inspect storm damage today?",
    answer:
      "Same-day storm damage inspections may be available depending on schedule and urgency. Please provide your address and describe the damage so the team can prioritize follow-up.",
    sourceCallCount: 7,
  },
  {
    question: "What should I do while water is leaking?",
    answer:
      "If safe, contain the water and avoid electrical fixtures near the leak. If there is immediate danger, contact emergency services first. The roofing team can follow up as soon as possible.",
    sourceCallCount: 5,
  },
];

export default function CompanyAgentPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Agent Settings</h1>
          <p className="page-subtitle">
            Review the approved services, FAQs, rules, and escalation contacts
            the receptionist uses when answering calls for this company.
          </p>
        </div>
        <span className="status-pill">Changes need review</span>
      </header>

      <div className="settings-grid">
        <section className="panel" aria-labelledby="rules-title">
          <div className="panel-header">
            <h2 className="panel-title" id="rules-title">
              Agent Rules
            </h2>
          </div>
          <div className="panel-body">
            <div className="rule-section">
              <div className="rule-group">
                <h3 className="rule-heading">Approved services</h3>
                <div className="chip-list">
                  {services.map((service) => (
                    <span className="chip" key={service}>
                      {service}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rule-group">
                <h3 className="rule-heading">Emergency rules</h3>
                <div className="queue-list">
                  {emergencyRules.map((rule) => (
                    <div className="queue-item" key={rule}>
                      <p className="queue-title">{rule}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rule-group">
                <h3 className="rule-heading">Booking rules</h3>
                <div className="queue-list">
                  {bookingRules.map((rule) => (
                    <div className="queue-item" key={rule}>
                      <p className="queue-title">{rule}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="panel" aria-labelledby="contact-title">
          <div className="panel-header">
            <h2 className="panel-title" id="contact-title">
              Routing
            </h2>
          </div>
          <div className="panel-body">
            <div className="contact-card">
              <div className="readonly-field">
                <span>Receptionist name</span>
                <strong>Mia</strong>
              </div>
              <div className="readonly-field">
                <span>Role</span>
                <strong>Receptionist</strong>
              </div>
              <div className="readonly-field">
                <span>Plan tier</span>
                <strong>Standard</strong>
              </div>
              <div className="readonly-field">
                <span>Live call model</span>
                <strong>gpt-4o-mini</strong>
              </div>
              <div className="readonly-field">
                <span>Back-office model</span>
                <strong>deepseek-chat</strong>
              </div>
              <div className="readonly-field">
                <span>Voice</span>
                <strong>Alice</strong>
              </div>
              <div className="readonly-field">
                <span>Escalation phone</span>
                <strong>+1 (604) 555-0000</strong>
              </div>
              <div className="readonly-field">
                <span>Notification email</span>
                <strong>dispatch@apexroofing.local</strong>
              </div>
              <div className="readonly-field">
                <span>Agent tone</span>
                <strong>Calm, concise, service-focused</strong>
              </div>
              <div className="readonly-field">
                <span>Response tuning</span>
                <strong>Temperature 0.5 · 150 tokens</strong>
              </div>
              <div className="readonly-field">
                <span>Greeting</span>
                <strong>Thanks for calling Apex Roofing, this is Mia.</strong>
              </div>
              <div className="readonly-field">
                <span>Calendar provider</span>
                <strong>Mock scheduling</strong>
              </div>
              <button className="button primary" type="button">
                Request changes
              </button>
            </div>
          </div>
        </aside>
      </div>

      <section className="panel" aria-labelledby="faq-title" style={{ marginTop: 20 }}>
        <div className="panel-header">
          <h2 className="panel-title" id="faq-title">
            Approved FAQs
          </h2>
        </div>
        <div className="panel-body">
          <div className="faq-list">
            {faqs.map((faq) => (
              <article className="faq-item" key={faq.question}>
                <p className="faq-question">{faq.question}</p>
                <p className="faq-answer">{faq.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" aria-labelledby="faq-suggestions-title" style={{ marginTop: 20 }}>
        <div className="panel-header">
          <h2 className="panel-title" id="faq-suggestions-title">
            Suggested FAQs
          </h2>
        </div>
        <div className="panel-body">
          <div className="faq-list">
            {faqSuggestions.map((faq) => (
              <article className="suggestion-item" key={faq.question}>
                <div className="lead-title-row">
                  <p className="faq-question">{faq.question}</p>
                  <span className="tag">{faq.sourceCallCount} calls</span>
                </div>
                <p className="faq-answer">{faq.answer}</p>
                <div className="suggestion-actions">
                  <button className="button primary" type="button">
                    Approve
                  </button>
                  <button className="button" type="button">
                    Edit
                  </button>
                  <button className="button" type="button">
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

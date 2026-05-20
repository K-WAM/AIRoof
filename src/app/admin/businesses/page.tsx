const businesses = [
  {
    name: "Apex Roofing",
    id: "demo-roofing",
    industry: "Roofing",
    status: "Active",
    readiness: 82,
    phone: "Mapped",
    tests: "3/4 passed",
    health: ["Agent active", "Mock calendar", "Rules drafted"],
  },
  {
    name: "Northline Roofing",
    id: "northline-roofing",
    industry: "Roofing",
    status: "Draft",
    readiness: 48,
    phone: "Not mapped",
    tests: "0/4 passed",
    health: ["Needs FAQs", "Needs phone", "Needs tests"],
  },
  {
    name: "Evergreen HVAC",
    id: "evergreen-hvac",
    industry: "HVAC",
    status: "Paused",
    readiness: 64,
    phone: "Mapped",
    tests: "2/4 passed",
    health: ["Inactive", "Rules drafted", "Needs calendar"],
  },
];

export default function AdminBusinessesPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Businesses</h1>
          <p className="page-subtitle">
            Monitor tenant setup, launch readiness, phone routing, and agent
            health across every company on the platform.
          </p>
        </div>
        <a className="button primary" href="/admin/onboarding">
          Add business
        </a>
      </header>

      <section className="metric-grid" aria-label="Business summary">
        <article className="metric">
          <p className="metric-label">Total businesses</p>
          <p className="metric-value">3</p>
        </article>
        <article className="metric">
          <p className="metric-label">Active agents</p>
          <p className="metric-value">1</p>
        </article>
        <article className="metric">
          <p className="metric-label">Need setup</p>
          <p className="metric-value">2</p>
        </article>
        <article className="metric">
          <p className="metric-label">Phone mapped</p>
          <p className="metric-value">2</p>
        </article>
      </section>

      <section className="panel" aria-labelledby="business-list-title">
        <div className="panel-header">
          <h2 className="panel-title" id="business-list-title">
            Company Setup Status
          </h2>
        </div>
        <div className="panel-body">
          <table className="business-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Status</th>
                <th>Readiness</th>
                <th>Phone</th>
                <th>Tests</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((business) => (
                <tr key={business.id}>
                  <td>
                    <p className="business-name">{business.name}</p>
                    <p className="business-id">
                      {business.id} · {business.industry}
                    </p>
                  </td>
                  <td>
                    <span className={business.status === "Active" ? "tag success" : "tag"}>
                      {business.status}
                    </span>
                  </td>
                  <td>
                    <div className="progress-track" aria-label={`${business.readiness}% ready`}>
                      <div
                        className="progress-fill"
                        style={{ width: `${business.readiness}%` }}
                      />
                    </div>
                    <p className="business-id">{business.readiness}% ready</p>
                  </td>
                  <td>{business.phone}</td>
                  <td>{business.tests}</td>
                  <td>
                    <div className="health-grid">
                      {business.health.map((item) => (
                        <span className="tag" key={item}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

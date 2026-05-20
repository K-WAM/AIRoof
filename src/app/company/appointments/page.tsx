const days = [
  { day: "Today", count: "4 inspections", selected: true },
  { day: "Tomorrow", count: "3 inspections", selected: false },
  { day: "Friday", count: "5 inspections", selected: false },
  { day: "Next week", count: "12 inspections", selected: false },
];

const appointments = [
  {
    time: "9:00 AM",
    duration: "60 min",
    customer: "Maria Chen",
    service: "Emergency leak inspection",
    address: "1428 W 12th Ave, Vancouver",
    status: "Urgent",
    checks: ["Address confirmed", "Caller reachable", "Escalation ready"],
  },
  {
    time: "11:30 AM",
    duration: "45 min",
    customer: "David Brooks",
    service: "Roof inspection",
    address: "88 Parker St, Burnaby",
    status: "Confirmed",
    checks: ["Address confirmed", "Photos requested"],
  },
  {
    time: "2:00 PM",
    duration: "60 min",
    customer: "Samir Patel",
    service: "Shingle replacement estimate",
    address: "219 Foster Ave, Coquitlam",
    status: "Needs callback",
    checks: ["Phone captured", "Warranty question"],
  },
  {
    time: "4:00 PM",
    duration: "30 min",
    customer: "Leah Morgan",
    service: "Metal roofing quote",
    address: "54 Royal Ave, New Westminster",
    status: "Confirmed",
    checks: ["Address confirmed", "Decision maker available"],
  },
];

export default function CompanyAppointmentsPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Appointments</h1>
          <p className="page-subtitle">
            Track inspection bookings created from AI-qualified calls and spot
            urgent roofing visits that need dispatcher attention.
          </p>
        </div>
        <span className="status-pill">Mock calendar</span>
      </header>

      <div className="toolbar">
        <div className="segmented-control" aria-label="Appointment filter">
          <button className="segment" type="button" aria-pressed="true">
            Scheduled
          </button>
          <button className="segment" type="button" aria-pressed="false">
            Urgent
          </button>
          <button className="segment" type="button" aria-pressed="false">
            Needs callback
          </button>
          <button className="segment" type="button" aria-pressed="false">
            Completed
          </button>
        </div>
        <button className="button primary" type="button">
          New appointment
        </button>
      </div>

      <div className="schedule-grid">
        <aside className="panel" aria-labelledby="days-title">
          <div className="panel-header">
            <h2 className="panel-title" id="days-title">
              Schedule
            </h2>
          </div>
          <div className="panel-body">
            <div className="day-list">
              {days.map((day) => (
                <article className="day-row" key={day.day} aria-selected={day.selected}>
                  <p className="day-name">{day.day}</p>
                  <span className="day-count">{day.count}</span>
                </article>
              ))}
            </div>
          </div>
        </aside>

        <section className="panel" aria-labelledby="appointments-title">
          <div className="panel-header">
            <h2 className="panel-title" id="appointments-title">
              Today&apos;s Inspections
            </h2>
          </div>
          <div className="panel-body">
            <div className="appointment-list">
              {appointments.map((appointment) => (
                <article className="appointment-card" key={`${appointment.time}-${appointment.customer}`}>
                  <div className="appointment-time">
                    <span className="time-main">{appointment.time}</span>
                    <span className="time-sub">{appointment.duration}</span>
                  </div>
                  <div>
                    <p className="appointment-title">{appointment.customer}</p>
                    <p className="appointment-meta">{appointment.service}</p>
                    <p className="appointment-meta">{appointment.address}</p>
                    <div className="appointment-checks">
                      {appointment.checks.map((check) => (
                        <span className="tag" key={check}>
                          {check}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className={appointment.status === "Urgent" ? "tag urgent" : "tag success"}>
                    {appointment.status}
                  </span>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

"use client";

import { ExampleTag } from "@/components/ui/ExampleTag";
import type { RosterRow } from "./roster";

// "Your team (N)" (T-371b): one row per person, logins and staff without a login together. On a phone each row is a
// stacked card (labels come from data-label), so nothing scrolls sideways. A row with a staff record opens its sheet.

function Cells({ row }: { row: RosterRow }) {
  return (
    <>
      <span className="team-roster-cell team-roster-cell--name">
        <strong>{row.name}</strong>
        {row.position && <span className="team-roster-sub">{row.position}</span>}
      </span>
      <span className="team-roster-cell" data-label="App access">{row.accessLabel}</span>
      <span className="team-roster-cell" data-label="Crew">
        {row.crewName ? <>
          {row.crewName}
          {row.crewLead && <span className="tag">Lead</span>}
          {row.crewIsSample && <ExampleTag />}
        </> : <span className="team-roster-sub">No crew</span>}
      </span>
      <span className="team-roster-cell" data-label="Login">
        <span className={`status-pill status-pill--${row.login === "Active" ? "ok" : row.login === "Disabled" ? "off" : "neutral"}`}>{row.login}</span>
      </span>
    </>
  );
}

export function TeamRoster({ rows, canEdit, onOpen }: { rows: RosterRow[]; canEdit: boolean; onOpen: (row: RosterRow) => void }) {
  return (
    <section className="panel team-people" aria-label="Your team" data-testid="team-people">
      <div className="panel-header"><h2 className="panel-title">Your team ({rows.length})</h2></div>
      <div className="team-roster-head" aria-hidden="true">
        <span>Name</span><span>App access</span><span>Crew</span><span>Login</span>
      </div>
      <ul className="team-roster-list">
        {rows.map((row) => (
          <li key={row.key}>
            {canEdit && row.staff
              ? <button type="button" className="team-roster-row team-roster-row--button" onClick={() => onOpen(row)} aria-label={`Edit ${row.name}`}><Cells row={row} /></button>
              : <div className="team-roster-row"><Cells row={row} /></div>}
          </li>
        ))}
      </ul>
      {canEdit && <p className="team-roster-note">Tap a person to edit their job title, crew or contact details. Only the invite button sends anything.</p>}
    </section>
  );
}

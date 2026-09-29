"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useFormat } from "@/hooks/useFormat";
import { useQuickAddRefresh } from "@/lib/events/quickAdd";
import { CREW_MEMBER_ROLES, TRADE_TITLES, TRADE_TITLE_LABEL, type TeamMember, type TradeTitle } from "@/types/team";
import { fieldsForUserType, parseUserType, userTypeDef, userTypeOf, userTypesFor, type UserType, type UserTypeDef } from "@/lib/team/userTypes";
import type { Crew } from "@/types/library";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { Info } from "lucide-react";

// ⓘ next to Type (T-150): tap-to-open, not a hover tooltip — phones never show those.
function InfoButton({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginLeft: 4 }}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((value) => !value)}
        style={{ border: "none", background: "transparent", padding: 2, cursor: "pointer", color: "var(--text-muted)", display: "inline-flex" }}>
        <Info size={14} strokeWidth={2} />
      </button>
      {open && (
        <>
          <span onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
          <span role="dialog" aria-label={label} style={{ position: "absolute", top: "calc(100% + 6px)", left: -8, zIndex: 31, width: "min(320px, calc(100vw - 32px))", padding: "12px 14px", background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(15,23,42,0.14)", fontSize: 13, fontWeight: 400, color: "var(--text)", lineHeight: 1.5, whiteSpace: "normal", textAlign: "left" }}>
            {children}
          </span>
        </>
      )}
    </span>
  );
}

function TypeHelp({ types }: { types: UserTypeDef[] }) {
  return (
    <InfoButton label="What each type can do">
      {types.map((type) => (
        <span key={type.id} style={{ display: "block", marginBottom: 6 }}><strong>{type.label}</strong> — {type.help}</span>
      ))}
      <span style={{ display: "block", color: "var(--text-muted)" }}>No account? A crew member can use a job&apos;s QR code instead.</span>
    </InfoButton>
  );
}

/** Titles the five types don't cover (Foreman, Installer…) stay visible, so changing a type never hides them. */
const TYPE_TITLES: ReadonlySet<TradeTitle> = new Set(["office", "inspector", "technician"]);

export default function TeamPage() {
  const businessId = useBusinessId();
  const { fmtDayTime } = useFormat();
  // Business-timezone "Sep 25, 8:59 PM" like every other page — never the browser's locale. Sign-in times arrive as ISO strings.
  const dateLabel = (value: number | string | null | undefined): string => {
    if (!value) return "—";
    const ms = typeof value === "number" ? value : Date.parse(value);
    return Number.isNaN(ms) ? "—" : fmtDayTime(ms);
  };
  const { user, loading: authLoading } = useAuth();
  const canManage = user?.role === "owner" || !!user?.superadmin;
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [seatLimit, setSeatLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  // One Type per person (owner, 2026-09-28: Admin / Office staff / Inspector / Technician) — a preset over role + title.
  const [userType, setUserType] = useState<UserType>("office");
  const [crewId, setCrewId] = useState("");
  const [crews, setCrews] = useState<Crew[]>([]);
  const { isEnabled } = useBusinessModules();
  // Crews, Inspectors and Technicians only exist where there is field work (the "jobs" module).
  const hasField = isEnabled("jobs");
  const typeOptions = userTypesFor(hasField);
  const inviteRole = userTypeDef(userType).role;
  const activeOwners = members.filter((member) => member.role === "owner" && member.active).length;

  const refresh = useCallback(async () => {
    if (!businessId || !canManage) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/company/team?businessId=${encodeURIComponent(businessId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load the team");
      setMembers(data.members ?? []);
      setSeatLimit(data.seatLimit ?? null);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the team");
    } finally {
      setLoading(false);
    }
  }, [businessId, canManage]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!businessId || !canManage) return;
    fetch(`/api/company/crews?businessId=${encodeURIComponent(businessId)}`)
      .then((response) => response.ok ? response.json() : { crews: [] })
      .then((data) => setCrews(data.crews ?? []))
      .catch(() => setCrews([]));
  }, [businessId, canManage]);
  useQuickAddRefresh("teammate", refresh);

  async function send(path: string, payload: object, key: string, success: string, method = "POST") {
    setBusy(key);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, ...payload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "The team change could not be saved");
      await refresh();
      setMessage(success);
      return data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The team change could not be saved");
      return null;
    } finally {
      setBusy(null);
    }
  }

  function inviteFields(type: UserType): { role: string; trade?: TradeTitle } {
    const fields = fieldsForUserType(type);
    return { role: fields.role, ...(fields.trade ? { trade: fields.trade } : {}) };
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    const data = await send("/api/company/team", {
      email: email.trim(), displayName: name.trim() || undefined, ...inviteFields(userType), crewId: crewId || undefined,
    }, "invite", "Team member added");
    if (data) { setEmail(""); setName(""); setUserType("office"); setCrewId(""); }
  }

  async function importCsv(file: File | undefined) {
    if (!file) return;
    const rows = (await file.text()).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      .filter((line) => !/^email\s*,/i.test(line))
      .map((line) => {
        // "email, type" — the old "email, role, title" files still import (owner → Admin, crew → Technician…).
        const [email, typeCell, titleCell] = line.split(",").map((cell) => cell.trim());
        const title = TRADE_TITLES.includes(titleCell as TradeTitle) ? titleCell as TradeTitle : undefined;
        const parsed = parseUserType(typeCell) ?? "office";
        const type: UserType = parsed === "technician" && title === "inspector" ? "inspector" : parsed;
        const fields = fieldsForUserType(type, title);
        return { email, role: fields.role, trade: fields.trade ?? undefined };
      });
    if (rows.length === 0) { setMessage("No team members found in the CSV file"); return; }
    const data = await send("/api/company/team/bulk", { rows }, "csv", "CSV import finished");
    if (data?.results) setMessage(`Imported ${data.results.filter((item: { status: string }) => item.status === "invited").length} of ${data.results.length} team members`);
  }

  function change(member: TeamMember, payload: object, action: string) {
    void send(`/api/company/team/${encodeURIComponent(member.uid)}`, payload, member.uid, action, "PATCH");
  }

  if (authLoading) return <p>Loading team…</p>;
  if (!canManage) return <p>Only an admin can manage the team.</p>;

  const th = { padding: "10px 12px", textAlign: "left" as const, fontWeight: 600, color: "var(--text-muted)", fontSize: 13, whiteSpace: "nowrap" as const };
  const td = { padding: "10px 12px", verticalAlign: "middle" as const, fontSize: 14 };
  const statusTag = (status: string) => (status === "Locked" ? "tag urgent" : status === "Active" ? "tag success" : "tag");
  const statusLabel = (status: string) => (status === "Locked" ? "Disabled" : status);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">Invite teammates, control who can get in, and revoke field QR links.</p>
        </div>
        {seatLimit !== null && <span className="status-pill">{members.filter((member) => member.active).length} of {seatLimit} seats in use</span>}
      </header>
      {message && <p role="status" style={{ margin: "0 0 12px", fontSize: 14 }}>{message}</p>}

      <section className="panel" aria-label="Invite a teammate" style={{ marginBottom: 20 }}>
        <div className="panel-header"><h2 className="panel-title">Invite a teammate</h2></div>
        <div className="panel-body">
          <form onSubmit={(event) => void invite(event)} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
            <label>Email<input aria-label="Invite email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} style={{ display: "block" }} /></label>
            <label>Name<input aria-label="Invite name" value={name} onChange={(event) => setName(event.target.value)} style={{ display: "block" }} /></label>
            <label>Type<TypeHelp types={typeOptions} /><select aria-label="Invite type" value={userType} onChange={(event) => setUserType(event.target.value as UserType)} style={{ display: "block" }}>{typeOptions.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
            {hasField && CREW_MEMBER_ROLES.has(inviteRole) && crews.length > 0 && <label>Crew<select aria-label="Invite crew" value={crewId} onChange={(event) => setCrewId(event.target.value)} style={{ display: "block" }}><option value="">No crew</option>{crews.map((crew) => <option key={crew.crewId} value={crew.crewId}>{crew.name}</option>)}</select></label>}
            <button className="button primary" disabled={busy !== null}>Send invite</button>
          </form>
          <label style={{ display: "block", marginTop: 14, fontSize: 13, color: "var(--text-muted)" }}>Import CSV (email, type — Admin, Office staff, Inspector, Technician or View only)
            <input type="file" accept=".csv,text/csv" onChange={(event) => { void importCsv(event.target.files?.[0]); event.target.value = ""; }} style={{ display: "block", marginTop: 4 }} />
          </label>
        </div>
      </section>

      <section className="panel" aria-label="Team members">
        <div className="panel-header"><h2 className="panel-title">Members</h2></div>
        <div className="panel-body" style={{ padding: 0 }}>
        {loading ? <p style={{ padding: 20 }}>Loading members…</p> : (
          // The invite form right above is the one action, so this carries no second "Invite" button.
          members.length === 1 && members[0]?.uid === user?.uid ? <EmptyState compact title="Just you so far" body="Invite your office and crew above. They get an email to join." testId="team-empty" /> : <div style={{ overflowX: "auto", maxWidth: "100%" }}>
            <table className="team-table" style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", textAlign: "left" }}>
              <thead><tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-muted, transparent)" }}>{["Name", "Email", "Type", ...(hasField ? ["Crew"] : []), "Status", "Last sign-in", "Invited", "Actions"].map((heading) => (
                <th key={heading} style={th}>{heading}{heading === "Type" && <TypeHelp types={typeOptions} />}</th>
              ))}</tr></thead>
              <tbody>{members.map((member) => (
                <tr key={member.uid} style={{ borderBottom: "1px solid var(--border)", ...(member.active ? {} : { opacity: 0.7 }) }}>
                  <td style={td} data-label="Name">{member.displayName || "—"}</td><td style={td} data-label="Email">{member.email}</td>
                  <td style={td} data-label="Type">
                    <select aria-label={`Type for ${member.email}`} value={userTypeOf(member)} disabled={busy !== null || !member.active}
                      onChange={(event) => change(member, fieldsForUserType(event.target.value as UserType, member.trade), "Type updated")}>
                      {[...typeOptions, ...(typeOptions.some((type) => type.id === userTypeOf(member)) ? [] : [userTypeDef(userTypeOf(member))])]
                        .map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                    </select>
                    {member.trade && !TYPE_TITLES.has(member.trade) && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Title: {TRADE_TITLE_LABEL[member.trade]}</div>}
                  </td>
                  {hasField && <td style={td} data-label="Crew">{CREW_MEMBER_ROLES.has(member.role) ? (
                    crews.length > 0
                      ? <select aria-label={`Crew for ${member.email}`} value={member.crewId ?? ""} disabled={busy !== null || !member.active} onChange={(event) => change(member, { crewId: event.target.value || null }, "Crew updated")}><option value="">No crew</option>{crews.map((crew) => <option key={crew.crewId} value={crew.crewId}>{crew.name}</option>)}</select>
                      : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Add crews in Library</span>
                  ) : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>}
                  <td style={td} data-label="Status"><span className={statusTag(member.status ?? (member.active ? "Active" : "Locked"))}>{statusLabel(member.status ?? (member.active ? "Active" : "Locked"))}</span></td>
                  <td style={td} data-label="Last sign-in">{dateLabel(member.lastSignInTime)}</td><td style={td} data-label="Invited">{dateLabel(member.createdAt)}</td>
                  <td style={td} data-label="">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {/* Disable turns the login off AND revokes its sessions; Enable restores it. (There is no separate "Remove":
                          it did exactly what this does, and a disabled member no longer takes a seat.) Stored as active:false —
                          the API and data still call it "Locked". Not offered on your own row or the last active owner. */}
                      {member.uid !== user?.uid && !(member.active && member.role === "owner" && activeOwners <= 1) && (
                        <button className="button small" disabled={busy !== null} onClick={() => { if (!member.active || window.confirm(`Disable ${member.email}? They are signed out, can't sign in until you enable them again, and their seat is freed.`)) change(member, { active: !member.active }, member.active ? "Member disabled — seat freed" : "Member enabled"); }}>{member.active ? "Disable" : "Enable"}</button>
                      )}
                      {member.active && !member.lastSignInTime && (
                        <button className="button small" disabled={busy !== null} onClick={() => { void send(`/api/company/team/${encodeURIComponent(member.uid)}/resend`, {}, member.uid, "Invite resent"); }}>Resend invite</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-header"><h2 className="panel-title">Field QR links</h2></div>
        <div className="panel-body">
          <p style={{ margin: "0 0 12px", fontSize: 14 }}>A job&apos;s QR code lets a crew member work without an account. If a phone is lost or a link got shared, revoke every QR link and open field session at once; crews then need a fresh QR code.</p>
          <button className="button" disabled={busy !== null} onClick={() => {
            if (window.confirm("Revoke all field QR links? Every open QR screen will need a new link.")) {
              void send("/api/company/team/revoke-field-links", {}, "revoke", "All field QR links revoked");
            }
          }}>Revoke all field QR links</button>
        </div>
      </section>
    </>
  );
}

"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useFormat } from "@/hooks/useFormat";
import { useQuickAddRefresh } from "@/lib/events/quickAdd";
import { TEAM_ROLES, TRADE_TITLES, TRADE_TITLE_LABEL, type TeamMember, type TeamRole, type TradeTitle } from "@/types/team";
import type { Crew } from "@/types/library";

const FIELD_TRADES: TradeTitle[] = ["technician", "journeyman", "apprentice", "installer", "helper"];

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
  const [role, setRole] = useState<TeamRole>("staff");
  const [trade, setTrade] = useState<TradeTitle | "">("");
  const [crewId, setCrewId] = useState("");
  const [crews, setCrews] = useState<Crew[]>([]);

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

  async function invite(event: FormEvent) {
    event.preventDefault();
    const data = await send("/api/company/team", {
      email: email.trim(), displayName: name.trim() || undefined, role, trade: trade || undefined, crewId: crewId || undefined,
    }, "invite", "Team member added");
    if (data) { setEmail(""); setName(""); setRole("staff"); setTrade(""); setCrewId(""); }
  }

  async function importCsv(file: File | undefined) {
    if (!file) return;
    const rows = (await file.text()).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      .filter((line) => !/^email\s*,/i.test(line))
      .map((line) => {
        const [email, role, trade] = line.split(",").map((cell) => cell.trim());
        return { email, role: TEAM_ROLES.includes(role as TeamRole) ? role : "staff", trade: TRADE_TITLES.includes(trade as TradeTitle) ? trade : undefined };
      });
    if (rows.length === 0) { setMessage("No team members found in the CSV file"); return; }
    const data = await send("/api/company/team/bulk", { rows }, "csv", "CSV import finished");
    if (data?.results) setMessage(`Imported ${data.results.filter((item: { status: string }) => item.status === "invited").length} of ${data.results.length} team members`);
  }

  function change(member: TeamMember, payload: object, action: string) {
    void send(`/api/company/team/${encodeURIComponent(member.uid)}`, payload, member.uid, action, "PATCH");
  }

  if (authLoading) return <p>Loading team…</p>;
  if (!canManage) return <p>Only an owner can manage the team.</p>;

  const th = { padding: "10px 12px", textAlign: "left" as const, fontWeight: 600, color: "var(--text-muted)", fontSize: 13, whiteSpace: "nowrap" as const };
  const td = { padding: "10px 12px", verticalAlign: "middle" as const, fontSize: 14 };
  const statusTag = (status: string) => (status === "Locked" ? "tag urgent" : status === "Active" ? "tag success" : "tag");

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
            <label>Role<select aria-label="Invite role" value={role} onChange={(event) => setRole(event.target.value as TeamRole)} style={{ display: "block" }}>{TEAM_ROLES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label>Title<select aria-label="Invite title" value={trade} onChange={(event) => setTrade(event.target.value as TradeTitle | "")} style={{ display: "block" }}><option value="">No title</option>{TRADE_TITLES.map((item) => <option key={item} value={item}>{TRADE_TITLE_LABEL[item]}</option>)}</select></label>
            {FIELD_TRADES.includes(trade as TradeTitle) && <label>Crew<select aria-label="Invite crew" value={crewId} onChange={(event) => setCrewId(event.target.value)} style={{ display: "block" }}><option value="">No crew</option>{crews.map((crew) => <option key={crew.crewId} value={crew.crewId}>{crew.name}</option>)}</select></label>}
            <button className="button primary" disabled={busy !== null}>Send invite</button>
          </form>
          <label style={{ display: "block", marginTop: 14, fontSize: 13, color: "var(--text-muted)" }}>Import CSV (email, role, title)
            <input type="file" accept=".csv,text/csv" onChange={(event) => { void importCsv(event.target.files?.[0]); event.target.value = ""; }} style={{ display: "block", marginTop: 4 }} />
          </label>
        </div>
      </section>

      <section className="panel" aria-label="Team members">
        <div className="panel-header"><h2 className="panel-title">Members</h2></div>
        <div className="panel-body" style={{ padding: 0 }}>
        {loading ? <p style={{ padding: 20 }}>Loading members…</p> : (
          <div style={{ overflowX: "auto", maxWidth: "100%" }}>
            <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", textAlign: "left" }}>
              <thead><tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-muted, transparent)" }}>{["Name", "Email", "Role", "Title", "Crew", "Status", "Last sign-in", "Invited", "Actions"].map((heading) => <th key={heading} style={th}>{heading}</th>)}</tr></thead>
              <tbody>{members.map((member) => (
                <tr key={member.uid} style={{ borderBottom: "1px solid var(--border)", ...(member.active ? {} : { opacity: 0.7 }) }}>
                  <td style={td}>{member.displayName || "—"}</td><td style={td}>{member.email}</td>
                  <td style={td}><select aria-label={`Role for ${member.email}`} value={member.role} disabled={busy !== null || !member.active} onChange={(event) => change(member, { role: event.target.value }, "Role updated")}>{TEAM_ROLES.map((item) => <option key={item} value={item}>{item}</option>)}</select></td>
                  <td style={td}><select aria-label={`Title for ${member.email}`} value={member.trade ?? ""} disabled={busy !== null || !member.active} onChange={(event) => change(member, { trade: event.target.value || null }, "Title updated")}><option value="">No title</option>{TRADE_TITLES.map((item) => <option key={item} value={item}>{TRADE_TITLE_LABEL[item]}</option>)}</select></td>
                  <td style={td}>{FIELD_TRADES.includes(member.trade as TradeTitle) ? <select aria-label={`Crew for ${member.email}`} value={member.crewId ?? ""} disabled={busy !== null || !member.active} onChange={(event) => change(member, { crewId: event.target.value || null }, "Crew updated")}><option value="">No crew</option>{crews.map((crew) => <option key={crew.crewId} value={crew.crewId}>{crew.name}</option>)}</select> : "—"}</td>
                  <td style={td}><span className={statusTag(member.status ?? (member.active ? "Active" : "Locked"))}>{member.status ?? (member.active ? "Active" : "Locked")}</span></td>
                  <td style={td}>{dateLabel(member.lastSignInTime)}</td><td style={td}>{dateLabel(member.createdAt)}</td>
                  <td style={td}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {/* Lock turns the login off AND revokes its sessions; Unlock restores it. (There is no separate "Remove":
                          it did exactly what Lock does, and a locked member no longer takes a seat.) */}
                      <button className="button small" disabled={busy !== null} onClick={() => { if (!member.active || window.confirm(`Lock ${member.email}? They are signed out and cannot get in until you unlock them.`)) change(member, { active: !member.active }, member.active ? "Member locked" : "Member unlocked"); }}>{member.active ? "Lock" : "Unlock"}</button>
                      <button className="button small" disabled={busy !== null || !member.active} onClick={() => { void send(`/api/company/team/${encodeURIComponent(member.uid)}/resend`, {}, member.uid, "Invite resent"); }}>Resend invite</button>
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

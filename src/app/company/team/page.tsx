"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useFormat } from "@/hooks/useFormat";
import { useQuickAddRefresh } from "@/lib/events/quickAdd";
import { CREW_MEMBER_ROLES, TRADE_TITLES, TRADE_TITLE_LABEL, type TeamMember, type TradeTitle } from "@/types/team";
import { fieldsForUserType, parseUserType, userTypeDef, userTypeOf, userTypesFor, type UserType } from "@/lib/team/userTypes";
import type { Crew } from "@/types/library";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { Modal } from "@/components/ui/Modal";

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
  const [controlError, setControlError] = useState<{ key: string; text: string } | null>(null);
  const [filter, setFilter] = useState<"Active" | "Invited" | "Disabled">("Active");
  const [inviteOpen, setInviteOpen] = useState(false);
  // T-168: the always-available role comparison (it was only reachable inside the invite/change-role forms).
  const [roleHelpOpen, setRoleHelpOpen] = useState(false);
  const [roleEditing, setRoleEditing] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<UserType>("office");
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
  const stateOf = (member: TeamMember): "Active" | "Invited" | "Disabled" => !member.active ? "Disabled" : member.status === "Invited" || !member.lastSignInTime ? "Invited" : "Active";
  const visibleMembers = members.filter((member) => stateOf(member) === filter);

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
    setControlError(null);
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
      const text = error instanceof Error ? error.message : "The team change could not be saved";
      setControlError({ key, text });
      if (key === "invite" || key === "csv" || key === "revoke") setMessage(text);
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
    if (data) { setEmail(""); setName(""); setUserType("office"); setCrewId(""); setInviteOpen(false); setFilter("Invited"); }
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
    return send(`/api/company/team/${encodeURIComponent(member.uid)}`, payload, member.uid, action, "PATCH");
  }

  if (authLoading) return <p>Loading team…</p>;
  if (!canManage) return <p>Only an admin can manage the team.</p>;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">Invite people and control access to your business.</p>
        </div>
        <div className="team-header-actions">
          {seatLimit !== null && <span className="status-pill">{members.filter((member) => member.active).length} of {seatLimit} seats in use</span>}
          <button type="button" className="button secondary" onClick={() => setRoleHelpOpen(true)}>What each role can do</button>
          <button type="button" className="button primary" onClick={() => setInviteOpen(true)}>Invite person</button>
        </div>
      </header>
      <Modal open={roleHelpOpen} onClose={() => setRoleHelpOpen(false)} title="What each role can do">
        <dl className="team-role-list">
          {typeOptions.map((type) => <div key={type.id}><dt>{type.label}</dt><dd>{type.help}</dd></div>)}
        </dl>
      </Modal>
      {message && <p role="status">{message}</p>}
      <div className="team-filters" aria-label="Member status">
        {(["Active", "Invited", "Disabled"] as const).map((status) =>
          <button type="button" key={status} className="button" aria-pressed={filter === status} onClick={() => setFilter(status)}>
            {status} <span>{members.filter((member) => stateOf(member) === status).length}</span>
          </button>)}
      </div>
      <section aria-label="Team members" className="team-roster">
        {loading ? <p>Loading members…</p> : filter === "Active" && members.length === 1 && members[0]?.uid === user?.uid
          // A brand-new account: say so instead of showing a roster of one. "Invite person" above is the one action.
          ? <EmptyState compact title="Just you so far" body="Invite your office and crew with Invite person. They get an email to join." testId="team-empty" />
          : visibleMembers.length === 0
          ? <EmptyState compact title={"No " + filter.toLowerCase() + " members"} body={filter === "Active" ? "Invite a person to get started." : "People in this state will appear here."} testId="team-empty" />
          : visibleMembers.map((member) => {
            const memberState = stateOf(member);
            const currentRole = userTypeOf(member);
            const roleOptions = [...typeOptions, ...(typeOptions.some((type) => type.id === currentRole) ? [] : [userTypeDef(currentRole)])];
            const isSelf = member.uid === user?.uid;
            const lastOwner = member.role === "owner" && activeOwners <= 1;
            return <article className="panel team-member-card" key={member.uid}>
              <div className="team-member-card__identity">
                <div><strong>{member.displayName || member.email}</strong><div>{member.email}</div></div>
                <span className={"tag " + (memberState === "Active" ? "success" : memberState === "Disabled" ? "urgent" : "")}>{memberState}</span>
              </div>
              <div className="team-member-card__details">
                <span><strong>Role</strong> {userTypeDef(currentRole).label}</span>
                {member.trade && !TYPE_TITLES.has(member.trade) && <span><strong>Title</strong> {TRADE_TITLE_LABEL[member.trade]}</span>}
                {hasField && CREW_MEMBER_ROLES.has(member.role) && <span><strong>Crew</strong> {crews.find((crew) => crew.crewId === member.crewId)?.name ?? "No crew"}</span>}
                <span><strong>Last sign-in</strong> {dateLabel(member.lastSignInTime)}</span>
                <span><strong>Invited</strong> {dateLabel(member.createdAt)}</span>
              </div>
              {roleEditing === member.uid && memberState === "Active" && <div className="team-role-review">
                <label>Role
                  <select aria-label={"Role for " + member.email} value={roleDraft} onChange={(event) => setRoleDraft(event.target.value as UserType)}>
                    {roleOptions.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                  </select>
                </label>
                <p>Changing {member.displayName || member.email} from {userTypeDef(currentRole).label} to {userTypeDef(roleDraft).label}. {userTypeDef(roleDraft).help}</p>
                <div className="team-member-card__actions">
                  <button className="button primary" disabled={busy !== null || roleDraft === currentRole} onClick={async () => {
                    if (await change(member, fieldsForUserType(roleDraft, member.trade), "Role updated")) setRoleEditing(null);
                  }}>Save role</button>
                  <button className="button" onClick={() => setRoleEditing(null)}>Cancel</button>
                </div>
              </div>}
              <div className="team-member-card__actions">
                {memberState === "Active" && roleEditing !== member.uid && <button type="button" className="button primary" disabled={busy !== null} onClick={() => { setRoleDraft(currentRole); setRoleEditing(member.uid); }}>Change role</button>}
                {memberState === "Invited" && <button type="button" className="button primary" disabled={busy !== null} onClick={() => { void send("/api/company/team/" + encodeURIComponent(member.uid) + "/resend", {}, member.uid, "Invite resent"); }}>Resend invite</button>}
                {memberState === "Disabled" && <button type="button" className="button primary" disabled={busy !== null} onClick={() => { void change(member, { active: true }, "Access re-enabled"); }}>Re-enable</button>}
                <details className="job-action-menu"><summary className="button">More</summary><div className="job-action-menu__items">
                  {memberState === "Active" && !isSelf && !lastOwner && <button className="button" disabled={busy !== null} onClick={() => {
                    if (window.confirm("Disable access for " + member.email + "? They will be signed out, cannot sign in, and their seat will be freed. Re-enable them here to restore access.")) void change(member, { active: false }, "Access disabled — seat freed");
                  }}>Disable access</button>}
                  {memberState === "Active" && (isSelf || lastOwner) && <span className="team-control-help">{isSelf ? "You cannot disable your own access here." : "The last active admin cannot be disabled."}</span>}
                  {memberState === "Invited" && <button className="button" disabled={busy !== null} onClick={() => {
                    if (window.confirm("Cancel the invite for " + member.email + "? They will not be able to sign in. Re-enable them here if needed.")) void change(member, { active: false }, "Invite canceled");
                  }}>Cancel invite</button>}
                  {hasField && CREW_MEMBER_ROLES.has(member.role) && memberState === "Active" && (crews.length > 0
                    ? <label>Crew<select aria-label={"Crew for " + member.email} value={member.crewId ?? ""} disabled={busy !== null} onChange={(event) => { void change(member, { crewId: event.target.value || null }, "Crew updated"); }}><option value="">No crew</option>{crews.map((crew) => <option key={crew.crewId} value={crew.crewId}>{crew.name}</option>)}</select></label>
                    : <span className="team-control-help">Add crews in Library</span>)}
                </div></details>
              </div>
              {controlError?.key === member.uid && <p role="alert" className="team-control-error">{controlError.text}</p>}
            </article>;
          })}
      </section>
      <details className="panel team-more">
        <summary>More team tools</summary>
        <div className="panel-body">
          <label>Import CSV (email, role — Admin, Office staff, Inspector, Technician or View only)
            <input type="file" accept=".csv,text/csv" onChange={(event) => { void importCsv(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
          <div>
            <strong>Field QR links</strong>
            <p>Revoke every field QR link and open field session for this business. Crews will need a fresh QR code from a job to regain field access.</p>
            <button className="button" disabled={busy !== null} onClick={() => {
              if (window.confirm("Revoke all field QR links? Every open QR screen will need a new link from its job.")) void send("/api/company/team/revoke-field-links", {}, "revoke", "All field QR links revoked");
            }}>Revoke all field QR links</button>
          </div>
        </div>
      </details>
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite person">
        <form onSubmit={(event) => void invite(event)} className="team-invite-form">
          <label>Name<input aria-label="Invite name" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Email<input aria-label="Invite email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Role<select aria-label="Invite role" value={userType} onChange={(event) => setUserType(event.target.value as UserType)}>{typeOptions.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
          <p>{userTypeDef(userType).help}</p>
          {hasField && CREW_MEMBER_ROLES.has(inviteRole) && crews.length > 0 && <label>Optional crew<select aria-label="Invite crew" value={crewId} onChange={(event) => setCrewId(event.target.value)}><option value="">No crew</option>{crews.map((crew) => <option key={crew.crewId} value={crew.crewId}>{crew.name}</option>)}</select></label>}
          {controlError?.key === "invite" && <p role="alert" className="team-control-error">{controlError.text}</p>}
          <button className="button primary" disabled={busy !== null}>Send invite</button>
        </form>
      </Modal>
    </>
  );
}

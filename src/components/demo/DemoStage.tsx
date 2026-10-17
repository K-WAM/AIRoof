"use client";

// The self-led demo's stage: the app's own menu and screens at full size, a progress bar, one caption and a spotlight
// on what just happened. Every menu item is clickable (it pauses the autopilot); Jobs → J-1001 opens a fully filled
// job — work log, materials, inspector's quote, report, invoice — so a visitor exploring sees the finished picture.
import type { ReactNode } from "react";
import type { DemoLine } from "./SelfLedDemo";

export type StageScreen = "dash" | "calls" | "pipe" | "cal" | "jobs" | "job" | "field" | "bill" | "cust" | "lib" | "team" | "set";
export type JobTab = "log" | "materials" | "quote" | "report" | "invoice";

interface Props {
  name: string; screen: StageScreen; tab: JobTab; browsing: boolean; caption: string; chip: string;
  segs: Array<{ label: string; current: boolean; fill: number }>; spotTarget: string; sc: number; frac: number;
  phase: string; booked: boolean; customer: string; when: string; address: string; callerShown: string; lastLine: string;
  callKind: string; lines: DemoLine[]; hideOn: boolean; onToggleHide: () => void;
  onNav: (id: StageScreen) => void; onTab: (tab: JobTab) => void; onResume: () => void; resumeLabel: string; endCard: ReactNode;
}

const NAV: Array<[string, StageScreen]> = [["Dashboard", "dash"], ["Calls", "calls"], ["Pipeline", "pipe"], ["Calendar", "cal"], ["Jobs", "jobs"],
  ["Field", "field"], ["Billing", "bill"], ["Customers", "cust"], ["Library", "lib"], ["Team", "team"], ["Settings", "set"]];
const TABS: Array<[JobTab, string]> = [["log", "Work log"], ["materials", "Materials"], ["quote", "Inspector's quote"], ["report", "Report"], ["invoice", "Invoice"]];
const PATHS: Record<StageScreen, string> = { dash: "/company/dashboard", calls: "/company/calls", pipe: "/company/pipeline", cal: "/company/calendar",
  jobs: "/company/jobs", job: "/company/jobs/J-1001", field: "/company/field", bill: "/company/billing", cust: "/company/customers",
  lib: "/company/library", team: "/company/team", set: "/company/settings" };
const NOTE = "Flashing on the chimney is lifted and two decking sheets are soaked. Replaced the flashing, two sheets of plywood, four hours.";
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DemoStage(p: Props) {
  const spot = (key: string) => (!p.spotTarget ? "" : p.spotTarget === key ? " sds-on" : " sds-off");
  const total = p.lines.reduce((sum, line) => sum + line.amount, 0);
  const initial = p.name.charAt(0).toUpperCase() || "Y";
  // Exploring shows the finished job; the autopilot shows it filling in.
  const done = (n: number) => p.browsing || p.phase === "end" || p.sc > n;
  const navOn = p.screen === "job" ? "jobs" : p.screen;

  // Calendar: the job card waits in Unscheduled, is dragged onto Crew A · Fri, then confirms.
  const moving = !p.browsing && p.sc === 3 && p.frac >= 0.25;
  const placed = (p.sc === 3 && p.frac >= 0.62) || done(3);
  const lifted = moving && !placed;
  // Field: words appear while the foreman talks, then the note lands in the job.
  const words = NOTE.split(" ");
  const fieldDone = done(4);
  const typed = p.sc === 4 && !p.browsing ? Math.floor(Math.min(1, p.frac / 0.55) * words.length) : fieldDone ? words.length : 0;
  const landed = fieldDone || (p.sc === 4 && p.frac >= 0.72);
  const recording = p.sc === 4 && !p.browsing && p.frac < 0.6;
  const crew = done(3) || placed ? "Crew A" : "Unscheduled";

  const Lines = ({ list }: { list: DemoLine[] }) => <>{list.map((line) => <div key={line.label} className="sds-row"><span>{line.label}</span><span>{money(line.amount)}</span></div>)}</>;
  const Example = () => <span className="sds-example">Example prices — you set your own</span>;

  return <section aria-label="Your app" className="sds">
    <style>{CSS}</style>
    <div className="sds-bar"><span aria-hidden="true" className="sds-dots"><i /><i /><i /></span><span className="sds-url">crm.luxordev.com{PATHS[p.screen]}{p.screen === "job" && p.tab !== "log" ? `?tab=${p.tab}` : ""}</span></div>
    <div className="sds-progress" role="progressbar" aria-label="Demo progress" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={Math.round((p.segs.reduce((s, x) => s + x.fill, 0) / p.segs.length) * 100)}>
      {p.segs.map((seg) => <div key={seg.label} className="sds-seg"><div className="sds-track"><div style={{ width: `${Math.round(seg.fill * 100)}%` }} /></div>
        <span className={seg.current ? "is-now" : seg.fill >= 1 ? "is-done" : ""}>{seg.label}</span></div>)}
    </div>
    {p.caption && <div className="sds-caption sds-pop" key={p.caption}>{p.caption}{p.chip && <span>{p.chip}</span>}</div>}
    {p.browsing && <div className="sds-caption sds-explore">Exploring your app<button type="button" onClick={p.onResume}>{p.resumeLabel}</button></div>}

    <div className="sds-app">
      <nav aria-label="App menu" className="sds-nav">
        <div className="sds-brand"><span>{initial}</span><strong>{p.name}</strong></div>
        {NAV.map(([label, id]) => <button key={id} type="button" aria-current={id === navOn ? "page" : undefined} className={id === navOn ? "is-on" : ""} onClick={() => p.onNav(id)}>{label}</button>)}
      </nav>
      <div className="sds-main">
        {p.screen === "dash" && <>
          <h2>Good morning, {p.name}</h2>
          <div className="sds-tiles">
            <div className="sds-card"><span>Calls today</span><strong>{p.booked ? 1 : 0}</strong></div>
            <div className="sds-card"><span>Bookings</span><strong>{p.booked ? 1 : 0}</strong></div>
            <div className="sds-card"><span>Open jobs</span><strong>{p.booked ? 1 : 0}</strong></div>
          </div>
          {p.booked ? <div className="sds-card"><strong>Next up:</strong> {p.customer} · Roof inspection · {p.when}</div>
            : <div className="sds-card sds-empty">Waiting for your first call…</div>}
        </>}

        {p.screen === "calls" && <>
          <h2>Calls</h2>
          {p.phase === "calling" || p.booked ? <div className={`sds-card sds-grid${spot("call")}`}>
            <div className="sds-head"><strong className="sds-lg">{p.phase === "calling" ? p.callerShown : p.customer}</strong><span className={`sds-badge ${p.phase === "calling" && p.spotTarget === "call" ? "is-live" : ""}`}>{p.phase === "calling" && p.spotTarget === "call" ? "Live" : "Booked"}</span></div>
            <span className="sds-muted">Today · {p.callKind}</span>
            <p>{p.phase === "calling" ? p.lastLine : "Booked a roof inspection for " + p.when + "."}</p>
          </div> : <div className="sds-card sds-empty">No calls yet.</div>}
        </>}

        {p.screen === "pipe" && <>
          <h2>Pipeline</h2>
          {p.booked ? <div className={`sds-card sds-grid sds-pop sds-accent${spot("appt")}`}>
            <div className="sds-head"><strong className="sds-xl">{p.customer}</strong><span className="sds-badge is-new">New booking</span></div>
            <strong>Roof inspection — leak near the chimney</strong>
            <span>{p.when} · {p.address}</span>
            <span className="sds-muted">Booked by Alice · just now</span>
          </div> : <div className="sds-card sds-empty">New bookings from your calls show here.</div>}
        </>}

        {p.screen === "cal" && <>
          <h2>Calendar</h2>
          <div className="sds-cal">
            <div className="sds-cal-grid">
              <div className="sds-cal-h is-tray">Unscheduled</div><div className="sds-cal-h">Thu</div><div className={`sds-cal-h${placed ? " is-hit" : ""}`}>Fri</div><div className="sds-cal-h">Sat</div>
              <div className="sds-cal-tray" /><div className="sds-cal-c"><b style={{ color: "var(--accent)" }}>Crew A</b></div><div className={`sds-cal-c${lifted ? " is-drop" : ""}`} /><div className="sds-cal-c" />
              <div className="sds-cal-c"><b style={{ color: "#7c3aed" }}>Crew B</b></div><div className="sds-cal-c"><div className="sds-cal-other">Gutter repair · 1 PM</div></div><div className="sds-cal-c" />
            </div>
            {p.booked && <div className={`sds-job-card${moving || placed ? " is-placed" : ""}${lifted ? " is-lifted" : ""}`}>
              <strong>J-1001 · {p.customer}</strong><span>Roof inspection · 10 AM</span>
              {placed && <em className="sds-pop">Confirmed · crew emailed</em>}
            </div>}
            {lifted && <span aria-hidden="true" className="sds-hand is-moving">➤</span>}
          </div>
        </>}

        {p.screen === "field" && <>
          <h2>Field updates</h2>
          <div className="sds-value"><strong>Job site</strong><span aria-hidden="true">→</span><strong>Office</strong><em>Instantly · no office trip</em></div>
          <div className="sds-field">
            <div className="sds-phone"><div>
              <span className="sds-phone-top">Carlos, foreman · <b>J-1001 · {p.address}</b></span>
              <span className={`sds-mic${recording ? " is-rec" : ""}`}>🎙</span>
              <b className="sds-mic-label">{recording ? "Recording at the job site…" : landed ? "Sent to the office ✓" : "Sending…"}</b>
              <p>&ldquo;{words.slice(0, typed).join(" ")}&rdquo;</p>
            </div></div>
            <div className="sds-arrow" aria-hidden="true"><span style={{ opacity: landed ? 1 : 0.35 }}>→</span><b>{landed ? "In the office in 2 s" : "Straight to the job"}</b></div>
            <div className={`sds-card sds-grid${landed && !p.browsing && p.sc === 4 ? " sds-on" : ""}`} style={{ flex: "1 1 240px", minWidth: 0 }}>
              <strong>J-1001 · Work log</strong>
              {landed ? <>
                <span className="sds-stamp sds-pop">From the job site · Carlos (foreman) · just now</span>
                <div className="sds-row sds-pop"><span>Step flashing</span><b>1 kit</b></div>
                <div className="sds-row sds-pop"><span>Plywood sheathing</span><b>2 sheets</b></div>
                <div className="sds-row sds-pop"><span>Labor · Crew A</span><b>4 hours</b></div>
                <span className="sds-found sds-pop">Found: lifted chimney flashing, wet decking</span>
              </> : <span className="sds-muted">Waiting for the foreman&apos;s note…</span>}
            </div>
          </div>
        </>}

        {p.screen === "jobs" && <>
          <h2>Jobs</h2>
          {p.booked ? <button type="button" className="sds-card sds-jobrow" onClick={() => p.onTab("log")}>
            <strong>J-1001</strong><span>Roof inspection · {p.customer}</span><span className="sds-muted">{p.when} · {crew}</span><span className="sds-badge">Open job →</span>
          </button> : <div className="sds-card sds-empty">No jobs yet. They start from a call.</div>}
        </>}

        {p.screen === "job" && <>
          <div className={`sds-card sds-grid${spot("job")}`}>
            <h2 style={{ margin: 0 }}>J-1001 · Roof inspection</h2>
            <span>{p.customer} · {p.address} · {p.when}{done(3) ? " · Crew A" : ""}</span>
          </div>
          <div className="sds-tabs" role="tablist" aria-label="Job sections">
            {TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={id === p.tab} className={id === p.tab ? "is-on" : ""} onClick={() => p.onTab(id)}>{label}</button>)}
          </div>
          {p.tab === "log" && <div className="sds-card sds-grid">
            {done(4) ? <>
              <span className="sds-stamp">From the job site to the office · Carlos (foreman)</span>
              <p>&ldquo;{NOTE}&rdquo;</p>
              <span className="sds-muted">Booked by Alice from the call · scheduled on Crew A · Fri 10 AM</span>
            </> : <span className="sds-muted">Job created from Alice&apos;s booking.</span>}
          </div>}
          {p.tab === "materials" && <div className="sds-card sds-grid">
            <div className="sds-row"><span>Step flashing</span><b>1 kit</b></div>
            <div className="sds-row"><span>Plywood sheathing</span><b>2 sheets</b></div>
            <div className="sds-row"><span>Labor · Crew A (Carlos)</span><b>4 hours</b></div>
            <span className="sds-muted">Filled in from the foreman&apos;s voice note — nobody typed it.</span>
          </div>}
          {p.tab === "quote" && <div className="sds-card sds-grid sds-pop">
            <div className="sds-head"><strong className="sds-lg">Inspector&apos;s quote Q-1001 · {p.customer}</strong><Example /></div>
            <Lines list={p.lines} />
            <div className={`sds-total${spot("total")}`}><span>Total</span><span>{money(total)}</span></div>
          </div>}
          {p.tab === "report" && <div className="sds-card sds-grid sds-pop">
            <strong className="sds-lg">Inspection report · {p.customer}</strong>
            <div className={spot("find")}><p><b>Found:</b> lifted chimney flashing; two water-damaged decking sheets.</p><p><b>Done:</b> flashing replaced; two sheets of decking replaced.</p></div>
            <span className="sds-muted">No prices on the report.</span>
          </div>}
          {p.tab === "invoice" && <div className="sds-card sds-grid sds-pop">
            <div className="sds-head"><span className="sds-logo">{initial}</span><strong className="sds-lg">{p.name}</strong><span className="sds-inv">Invoice<br /><small>INV-1001</small></span></div>
            <div className={`sds-switchrow${spot("toggle")}`}>
              <button type="button" role="switch" aria-checked={p.hideOn} aria-label="Hide the breakdown from the customer" className={`sds-switch${p.hideOn ? " is-on" : ""}`} onClick={p.onToggleHide}><i /></button>
              <strong>Hide the breakdown from the customer</strong><span className="sds-muted">{p.hideOn ? "Customer sees one project price" : "Customer sees every line"}</span>
            </div>
            <span><b>Bill to</b> {p.customer} · {p.address}</span>
            {p.hideOn ? <div className="sds-row sds-pop"><span>Roof repair — project price</span><span>{money(total)}</span></div> : <Lines list={p.lines} />}
            <div className="sds-total"><span>Total due</span><span>{money(total)}</span></div>
            <Example />
          </div>}
        </>}

        {p.screen === "bill" && <>
          <h2>Billing</h2>
          {done(7) || p.sc >= 7 ? <div className="sds-card sds-jobrow"><strong>INV-1001</strong><span>{p.customer} · J-1001</span><b>{money(total)}</b><span className="sds-badge">Ready to send</span></div>
            : <div className="sds-card sds-empty">No invoices yet. They&apos;re made from finished jobs.</div>}
        </>}

        {p.screen === "cust" && <>
          <h2>Customers</h2>
          {p.booked ? <div className="sds-card sds-grid">
            <div className="sds-head"><strong className="sds-lg">{p.customer}</strong><span className="sds-badge is-new">New today</span></div>
            <span>{p.address} · from a phone call</span><span className="sds-muted">1 job · J-1001 Roof inspection</span>
          </div> : <div className="sds-card sds-empty">Every caller is saved here automatically.</div>}
        </>}

        {p.screen === "lib" && <>
          <h2>Library</h2>
          <div className="sds-chips"><b>Common fixes</b><span>Prices &amp; rates</span><span>Crews</span><span>Logo</span><span>Documents</span></div>
          <div className="sds-card sds-grid">
            <div className="sds-row"><span>Chimney leak · counter-flashing + re-flash</span><b>{money(p.lines.filter((l) => /flash/i.test(l.label)).reduce((s, l) => s + l.amount, 0))}</b></div>
            <div className="sds-row"><span>Soft decking · plywood + replacement labor</span><b>{money(p.lines.filter((l) => !/flash/i.test(l.label)).reduce((s, l) => s + l.amount, 0))}</b></div>
            <div className="sds-row"><span>Leak trace and temporary cover</span><b>$486.00</b></div>
          </div>
          <span className="sds-example">Example prices — you set your own. Quotes and invoices fill in from here.</span>
        </>}

        {p.screen === "team" && <>
          <h2>Team</h2>
          <div className="sds-card sds-jobrow"><strong>You</strong><span className="sds-muted">Admin</span></div>
          <div className="sds-card sds-jobrow"><strong>Carlos</strong><span>Crew A</span><span className="sds-muted">Foreman · field only</span></div>
          <div className="sds-card sds-jobrow"><strong>Ana</strong><span>Office</span><span className="sds-muted">Office staff</span></div>
        </>}

        {p.screen === "set" && <>
          <h2>Settings</h2>
          <div className="sds-card sds-grid">
            <div><span className="sds-muted">Business name</span><br /><strong>{p.name}</strong></div>
            <div><span className="sds-muted">Hours</span><br />Mon–Fri 8 AM – 5 PM · Alice books after hours too</div>
            <div><span className="sds-muted">Alice&apos;s greeting</span><br />&ldquo;Thanks for calling {p.name}, this is Alice. How can I help?&rdquo;</div>
            <div><span className="sds-muted">Languages</span><br />English &amp; Spanish</div>
          </div>
        </>}
      </div>
    </div>
    {p.endCard}
  </section>;
}

const CSS = `
.sds{flex:999 1 560px;min-width:0;position:relative;border-radius:18px;background:var(--surface);border:1px solid var(--border);box-shadow:0 14px 40px rgba(15,23,42,.12);overflow:hidden;display:flex;flex-direction:column;min-height:680px}
.sds-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface-muted);border-bottom:1px solid var(--border)}
.sds-dots{display:flex;gap:6px}.sds-dots i{width:10px;height:10px;border-radius:50%;background:#cbd5e1}
.sds-url{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--text-muted);background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:5px 10px}
.sds-progress{display:flex;gap:4px;padding:10px 14px 8px;border-bottom:1px solid var(--border)}
.sds-seg{flex:1;min-width:0;display:grid;gap:5px}
.sds-track{height:8px;border-radius:999px;background:var(--border);overflow:hidden}.sds-track div{height:100%;background:var(--accent);border-radius:999px;transition:width .2s linear}
.sds-seg span{font-size:11px;line-height:1.2;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#94a3b8}
.sds-seg span.is-now{font-weight:800;color:var(--accent)}.sds-seg span.is-done{color:var(--text)}
.sds-caption{position:absolute;top:112px;left:16px;right:16px;margin:0 auto;z-index:5;width:fit-content;max-width:760px;box-sizing:border-box;padding:12px 20px;border-radius:14px;background:#0b1d24;color:#fff;font-size:19px;font-weight:700;text-align:center;box-shadow:0 10px 30px rgba(8,20,25,.35);overflow-wrap:anywhere}
.sds-caption span{display:inline-block;margin-left:10px;font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;background:#2dd4bf;color:#0b1d24;vertical-align:middle}
.sds-explore{display:flex;align-items:center;gap:12px;padding:8px 8px 8px 18px;font-size:16px}
.sds-explore button{min-height:40px;padding:0 16px;border:0;border-radius:10px;background:#2dd4bf;color:#0b1d24;font-weight:800;cursor:pointer}
.sds-app{display:flex;flex-wrap:wrap;flex:1;min-height:0}
.sds-nav{flex:1 1 150px;max-width:100%;box-sizing:border-box;padding:14px 10px;border-right:1px solid var(--border);background:#fbfcfd;display:flex;flex-direction:column;gap:2px}
.sds-nav button{width:100%;min-height:36px;display:flex;align-items:center;padding:0 10px;border:0;border-radius:8px;background:transparent;text-align:left;font-size:14px;color:#475569;cursor:pointer}
.sds-nav button.is-on{font-weight:800;background:var(--accent-soft);color:var(--accent)}
.sds-brand{display:flex;align-items:center;gap:8px;padding:0 6px 12px}.sds-brand span{display:grid;place-items:center;flex:none;width:30px;height:30px;border-radius:8px;background:var(--accent);color:#fff;font-weight:800}
.sds-brand strong{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sds-main{flex:999 1 380px;min-width:0;padding:96px 22px 22px;box-sizing:border-box;background:#f8fafc;display:flex;flex-direction:column;gap:14px}
.sds-main h2{margin:0;font-size:24px}
.sds-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;font-size:15px;color:var(--text);transition:all .45s ease}
.sds-grid{display:grid;gap:8px}.sds-grid p{margin:0;line-height:1.45}
.sds-empty{border-style:dashed;text-align:center;color:var(--text-muted);padding:26px}
.sds-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.sds-tiles span{display:block;font-size:13px;color:var(--text-muted)}.sds-tiles strong{font-size:28px}
.sds-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.sds-head > :last-child{margin-left:auto}
.sds-lg{font-size:18px}.sds-xl{font-size:20px}.sds-muted{color:var(--text-muted);font-size:14px}
.sds-accent{border:2px solid var(--accent)}
.sds-badge{font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;background:#ccfbf1;color:#115e59}
.sds-badge.is-live{background:#fee2e2;color:#991b1b}.sds-badge.is-new{background:#fef3c7;color:#92400e}
.sds-on{position:relative;z-index:2;box-shadow:0 0 0 4px var(--accent),0 0 0 14px rgba(15,118,110,.18);transform:scale(1.02);border-radius:14px}
.sds-off{opacity:.55}
.sds-row{display:flex;justify-content:space-between;gap:12px;font-size:15px;color:#334155}
.sds-total{display:flex;justify-content:space-between;gap:12px;font-size:19px;font-weight:800;border-top:1px solid var(--border);padding-top:10px;transition:all .45s ease}
.sds-example{justify-self:start;font-size:11px;color:#92400e;background:#fef3c7;border-radius:999px;padding:3px 9px}
.sds-tabs{display:flex;gap:2px;overflow-x:auto;border-bottom:1px solid var(--border)}
.sds-tabs button{flex:none;padding:10px 14px;font-size:15px;border:0;background:none;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer;min-height:44px}
.sds-tabs button.is-on{font-weight:800;color:var(--accent);border-bottom-color:var(--accent)}
.sds-jobrow{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;text-align:left;cursor:pointer;width:100%;font:inherit}
.sds-jobrow > :last-child{margin-left:auto}
.sds-cal{position:relative;height:300px;border:1px solid var(--border);border-radius:14px;background:var(--surface);overflow:hidden}
.sds-cal-grid{position:absolute;inset:0;display:grid;grid-template-columns:22fr 26fr 26fr 26fr;grid-template-rows:40px 1fr 1fr}
.sds-cal-h{padding:10px;font-size:13px;font-weight:700;border-right:1px solid var(--border);border-bottom:1px solid var(--border)}
.sds-cal-h.is-tray{font-size:12px;color:var(--text-muted);background:#f8fafc}.sds-cal-h.is-hit{background:#f0fdfa}
.sds-cal-tray{grid-row:span 2;background:#f8fafc;border-right:1px solid var(--border)}
.sds-cal-c{border-right:1px solid var(--border);border-bottom:1px solid var(--border);padding:6px 8px;font-size:12px}.sds-cal-c.is-drop{background:rgba(15,118,110,.08)}
.sds-cal-other{border-radius:8px;background:#ede9fe;color:#5b21b6;font-size:11px;padding:6px 8px}
.sds-job-card{position:absolute;z-index:3;box-sizing:border-box;width:24%;padding:8px 10px;border-radius:10px;background:var(--accent);color:#fff;left:1%;top:52px;font-size:11px;display:grid;gap:2px;
  transition:left 1.5s cubic-bezier(.5,0,.2,1),top 1.5s cubic-bezier(.5,0,.2,1),transform .3s,box-shadow .3s;box-shadow:0 2px 6px rgba(15,23,42,.15)}
.sds-job-card strong{font-size:12px}.sds-job-card.is-placed{left:48.6%;top:48px}.sds-job-card.is-lifted{transform:rotate(-3deg) scale(1.06);box-shadow:0 16px 30px rgba(15,23,42,.35)}
.sds-job-card em{font-style:normal;justify-self:start;margin-top:4px;font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;background:#fff;color:var(--accent)}
.sds-hand{position:absolute;z-index:4;left:66%;top:96px;font-size:22px;transform:rotate(-30deg)}
.sds-value{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;padding:14px 16px;border-radius:14px;background:var(--accent);color:#fff;font-size:18px}
.sds-value em{font-style:normal;font-size:14px;font-weight:700;padding:4px 12px;border-radius:999px;background:#ccfbf1;color:#115e59}
.sds-field{display:flex;flex-wrap:wrap;gap:16px;align-items:center}
.sds-phone{flex:1 1 220px;max-width:280px;margin:0 auto;box-sizing:border-box;padding:14px;border-radius:30px;background:#0f172a;box-shadow:0 12px 30px rgba(15,23,42,.3)}
.sds-phone > div{border-radius:20px;background:#0b1d24;color:#e2e8f0;padding:16px;display:grid;gap:10px;min-height:290px;align-content:start;justify-items:center;text-align:center}
.sds-phone-top{font-size:12px;color:#94a3b8}.sds-phone-top b{color:#fff}
.sds-phone p{margin:0;font-size:14px;line-height:1.45;background:#12303a;border-radius:12px;padding:10px 12px;min-height:84px;text-align:left;justify-self:stretch}
.sds-mic{display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:var(--accent);font-size:26px}.sds-mic.is-rec{background:#dc2626;animation:sld-blink 1.2s ease-in-out infinite}
.sds-mic-label{font-size:13px}
.sds-arrow{flex:0 0 auto;display:grid;place-items:center;gap:4px;color:var(--accent)}.sds-arrow span{font-size:34px;font-weight:800;line-height:1;transition:opacity .4s}.sds-arrow b{font-size:12px}
.sds-stamp{font-size:13px;font-weight:700;color:var(--accent)}.sds-found{font-size:13px;color:#b45309}
.sds-logo{display:grid;place-items:center;width:44px;height:44px;border-radius:10px;background:var(--accent);color:#fff;font-weight:800;font-size:19px}
.sds-inv{text-align:right;font-size:20px;font-weight:800}.sds-inv small{font-size:12px;font-weight:400;color:var(--text-muted)}
.sds-switchrow{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;background:#f8fafc;border:1px solid var(--border);transition:all .45s ease}
.sds-switch{position:relative;flex:none;width:52px;height:30px;border:0;border-radius:999px;padding:0;background:#cbd5e1;cursor:pointer;transition:background .3s}
.sds-switch i{position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .3s}
.sds-switch.is-on{background:var(--accent)}.sds-switch.is-on i{left:25px}
.sds-chips{display:flex;flex-wrap:wrap;gap:6px}.sds-chips > *{font-size:13px;padding:6px 12px;border-radius:999px;background:var(--surface);border:1px solid var(--border)}
.sds-chips b{background:var(--accent);color:#fff;border-color:var(--accent)}
.sds-pop{animation:sld-pop .6s ease-out both}
@media (max-width:640px){.sds{min-height:600px}.sds-main{padding:14px}
  .sds-caption{position:static;margin:10px 12px 0;width:auto;max-width:none;font-size:16px;padding:10px 14px}
  .sds-seg span{font-size:9px}
  .sds-nav{flex:1 1 100%;flex-direction:row;flex-wrap:nowrap;overflow-x:auto;gap:4px;padding:8px 10px;border-right:0;border-bottom:1px solid var(--border)}
  .sds-nav button{width:auto;flex:none;white-space:nowrap}.sds-brand{flex:none;padding:0 6px 0 0}.sds-brand strong{display:none}
  .sds-field{flex-direction:column}.sds-arrow span{transform:rotate(90deg)}}
`;

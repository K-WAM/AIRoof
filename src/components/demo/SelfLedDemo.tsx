"use client";

// The self-led demo (docs/SELF-LED-DEMO-PLAN.md, owner-approved 2026-10-16). Three steps: type a business name → talk
// to Alice (a real call; or dial in with no code; or Just watch) → the office runs on autopilot on a large stage. The
// call and booking are real (the private trial in src/lib/demo/roofingTrial.ts); the later office steps are shown with
// the visitor's own booking details and the starter price list's example prices, labelled as examples.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { VoiceConversation } from "@elevenlabs/client";
import { DemoStage, type StageScreen, type JobTab } from "./DemoStage";
import { EnterSandboxButton } from "@/app/try/[vertical]/EnterSandboxButton";

export interface DemoLine { label: string; kind: "material" | "labor" | "other"; amount: number }
type Phase = "start" | "choose" | "calling" | "auto" | "end";
type Mode = "talk" | "dial" | "watch";
interface Caption { who: string; text: string }
interface Booking { callerName: string; when: string; address: string }
interface Live { booked: boolean; callerName: string | null; startTime: string | number | null; address: string | null; phoneCallAt: number | null }

const DEMO_PHONE = "+1 (689) 204-2643";
const DEMO_TEL = "tel:+16892042643";
/** Seconds per autopilot scene: Booking · Job · Calendar · Field updates · Inspector's quote · Report · Invoice. */
const SCENE_MS = [0, 5000, 5000, 7000, 9000, 5000, 5000, 6000];
const SCENES: Array<[string, string, string?]> = [
  ["Booking", "Booked. It's already in your app."],
  ["Job", "One tap turns it into a job.", "Your office: 1 tap"],
  ["Calendar", "Drag it onto a crew. They get an email.", "Your office: 1 drag"],
  ["Field updates", "From the job site to the office, instantly. No office trip."],
  ["Inspector's quote", "Your inspector's quote builds itself from your prices."],
  ["Report", "A clean report for your customer. No prices."],
  ["Invoice", "Invoice ready. Hide the breakdown with one switch."],
];
const SAMPLE_BOOKING: Booking = { callerName: "Sam Rivera", when: "Fri 10:00 AM", address: "123 Palm Ave, Miami" };

async function trialPost(body: Record<string, unknown>) {
  const response = await fetch("/api/demo/roofing-trial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || "Please try again."), { status: response.status });
  return data;
}
function formatWhen(value: string | number | null): string {
  if (value === null) return SAMPLE_BOOKING.when;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? SAMPLE_BOOKING.when
    : date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}
function splitContact(raw: string): { email?: string; phone?: string } {
  const value = raw.trim();
  if (!value) return {};
  return value.includes("@") ? { email: value } : { phone: value };
}

export function SelfLedDemo({ lines, bookCallUrl }: { lines: DemoLine[]; bookCallUrl: string }) {
  const [phase, setPhase] = useState<Phase>("start");
  const [mode, setMode] = useState<Mode>("talk");
  const [biz, setBiz] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [trialReady, setTrialReady] = useState(false);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [callState, setCallState] = useState<"idle" | "connecting" | "connected" | "waiting-phone" | "on-phone" | "ended">("idle");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [scene, setScene] = useState(0);
  const [ms, setMs] = useState(0);
  const [paused, setPaused] = useState(false);
  const [browse, setBrowse] = useState<StageScreen | null>(null);
  const [browseTab, setBrowseTab] = useState<JobTab>("log");
  const [exploring, setExploring] = useState(false);
  const [hideSet, setHideSet] = useState<boolean | null>(null);
  const [reach, setReach] = useState<"closed" | "open" | "sent">("closed");
  const [reachError, setReachError] = useState("");
  const [bookedSecs, setBookedSecs] = useState(0);
  const conversation = useRef<VoiceConversation | null>(null);
  const t0 = useRef(0);
  const watchLine = useRef(0);
  const mounted = useRef(true);

  const name = biz.trim() || "Your Business";
  const sample = mode === "watch";
  const customer = booking?.callerName || SAMPLE_BOOKING.callerName;

  useEffect(() => () => { mounted.current = false; void conversation.current?.endSession(); }, []);

  const markBooked = useCallback((b: Booking) => {
    setBooking(b);
    setBookedSecs(Math.max(1, Math.round((Date.now() - t0.current) / 1000)));
  }, []);
  const startAuto = useCallback((n = 1) => {
    void conversation.current?.endSession();
    setPhase("auto"); setScene(n); setMs(0); setBrowse(null); setPaused(false);
  }, []);

  // One 200 ms clock: the scripted sample call and the autopilot scenes (the progress bar reads the same clock).
  useEffect(() => {
    if (phase !== "auto" && !(phase === "calling" && sample)) return;
    const timer = setInterval(() => {
      if (phase === "calling") {
        setMs((value) => value + 200);
        return;
      }
      if (paused || browse) return;
      setMs((value) => value + 200);
    }, 200);
    return () => clearInterval(timer);
  }, [phase, sample, paused, browse]);

  // Sample call: a new line every 3 s, booked on the fifth, then the autopilot.
  useEffect(() => {
    if (phase !== "calling" || !sample) return;
    const script = sampleScript(name);
    const due = Math.min(script.length, Math.floor(ms / 3000) + 1);
    if (due > watchLine.current) {
      watchLine.current = due;
      setCaptions(script.slice(0, due));
      if (due === script.length) markBooked(SAMPLE_BOOKING);
    }
    if (due === script.length && ms >= script.length * 3000 + 2500) startAuto(1);
  }, [phase, sample, ms, name, markBooked, startAuto]);

  // Autopilot: advance scenes.
  useEffect(() => {
    if (phase !== "auto" || scene === 0) return;
    if (ms >= SCENE_MS[scene]) {
      if (scene >= 7) setPhase("end");
      else { setScene(scene + 1); setMs(0); }
    }
  }, [phase, scene, ms]);

  // Live call / phone: poll this trial's own booking every 2.5 s; keep the shared phone line pointed at this page.
  useEffect(() => {
    if (!trialReady || !(phase === "choose" || (phase === "calling" && !sample))) return;
    let stopped = false;
    const poll = async () => {
      try {
        const live: Live = await (await fetch("/api/demo/roofing-trial?live=1", { cache: "no-store" })).json();
        if (stopped || !mounted.current) return;
        if (live.phoneCallAt && phase === "calling" && mode === "dial") setCallState((state) => (state === "waiting-phone" ? "on-phone" : state));
        if (live.booked && phase === "calling") {
          markBooked({ callerName: live.callerName || SAMPLE_BOOKING.callerName, when: formatWhen(live.startTime), address: live.address || SAMPLE_BOOKING.address });
        }
      } catch { /* the next poll retries */ }
    };
    const arm = () => { if (phase === "choose" || callState === "waiting-phone") void trialPost({ action: "arm", dial: mode === "dial" && callState === "waiting-phone" }).catch(() => {}); };
    arm();
    const pollTimer = setInterval(poll, 2500), armTimer = setInterval(arm, 15000);
    return () => { stopped = true; clearInterval(pollTimer); clearInterval(armTimer); };
  }, [trialReady, phase, sample, mode, callState, markBooked]);

  // A phone booking moves on by itself after a short pause; a browser call moves on when it ends.
  useEffect(() => {
    if (phase !== "calling" || sample || !booking) return;
    if (mode === "dial" || callState === "ended") {
      const timer = setTimeout(() => startAuto(1), mode === "dial" ? 6000 : 2000);
      return () => clearTimeout(timer);
    }
  }, [phase, sample, booking, mode, callState, startAuto]);

  async function start(event: FormEvent) {
    event.preventDefault();
    if (!biz.trim()) { setError("Enter your business name."); return; }
    setBusy(true); setError("");
    try {
      await trialPost({ action: "create", companyName: biz.trim(), ...splitContact(contact) });
      setTrialReady(true);
    } catch (err) {
      // Over the daily limit (or offline): the sample still works, so the visitor is never stuck.
      setTrialReady(false);
      setError((err as { status?: number }).status === 429 ? "Today's live calls are all taken. Tap Just watch, or book a call with us." : (err as Error).message);
      if ((err as { status?: number }).status === 400) { setBusy(false); return; }
    }
    setBusy(false);
    setPhase("choose");
  }

  function begin(next: Mode) {
    setMode(next); setCaptions([]); setBooking(null); setScene(0); setMs(0); setHideSet(null); setExploring(false);
    setReach("closed"); setBrowse(null); watchLine.current = 0; t0.current = Date.now(); setError("");
    setPhase("calling");
    if (next === "watch") { setCallState("connected"); return; }
    if (next === "dial") { setCallState("waiting-phone"); void trialPost({ action: "arm", dial: true }).catch(() => {}); return; }
    void talk();
  }

  async function talk() {
    setCallState("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const data = await trialPost({ action: "call" });
      const { Conversation } = await import("@elevenlabs/client");
      const started = await Conversation.startSession({ signedUrl: data.signedUrl, connectionType: "websocket", textOnly: false as const,
        workletPaths: { rawAudioProcessor: "/voice-worklets/rawAudioProcessor.js", audioConcatProcessor: "/voice-worklets/audioConcatProcessor.js" },
        libsampleratePath: "/voice-worklets/libsamplerate.worklet.js",
        dynamicVariables: data.dynamicVariables,
        overrides: { agent: { prompt: { prompt: data.prompt }, firstMessage: data.firstMessage, language: "en" } },
        onConnect: () => setCallState("connected"),
        onMessage: (message) => setCaptions((list) => [...list, { who: message.source === "ai" ? "Alice" : "You", text: message.message }].slice(-6)),
        onDisconnect: () => { conversation.current = null; setCallState("ended"); },
        onError: () => { setError("The call dropped. Tap Talk to Alice to try again."); setCallState("ended"); },
      });
      conversation.current = started;
      if (!mounted.current) { await started.endSession(); return; }
      setTimeout(() => { void conversation.current?.endSession(); }, Math.max(30, Number(data.maxSeconds) || 180) * 1000);
    } catch (err) {
      setCallState("idle"); setPhase("choose");
      const message = err instanceof Error ? err.message : "";
      setError(/permission|denied|notallowed|microphone/i.test(message) ? `Your microphone is blocked. Tap Just watch, or dial ${DEMO_PHONE}.` : message || "Could not start the call. Please try again.");
    }
  }

  function endCall() {
    void conversation.current?.endSession();
    if (booking) startAuto(1);
    else { setCallState("ended"); setPhase("choose"); }
  }

  async function sendReach() {
    setReachError("");
    if (!trialReady) { setReachError("Please use Book a call with us."); return; }
    try { await trialPost({ action: "reach", contact }); setReach("sent"); }
    catch (err) { setReachError((err as Error).message); }
  }

  // ── what the stage shows ──────────────────────────────────────────────────────────────────────────────────────
  const sc = phase === "auto" ? scene : phase === "end" ? 7 : 0;
  const frac = phase === "auto" && scene ? Math.min(1, ms / SCENE_MS[scene]) : 0;
  const booked = Boolean(booking) || phase === "auto" || phase === "end";
  let screen: StageScreen = "dash";
  if (phase === "calling") screen = booking ? "pipe" : "calls";
  if (phase === "auto" || phase === "end") screen = (["dash", "pipe", "job", "cal", "field", "job", "job", "job"] as StageScreen[])[sc];
  let tab: JobTab = sc === 5 ? "quote" : sc === 6 ? "report" : sc === 7 ? "invoice" : "log";
  if (browse) { screen = browse; tab = browseTab; }
  const browsing = Boolean(browse);
  let caption = "", chip = "";
  if (phase === "calling") caption = booking ? "Booked. It's already in your app." : `Alice is answering for ${name}…`;
  if (phase === "auto" && scene) { caption = SCENES[scene - 1][1]; chip = SCENES[scene - 1][2] ?? ""; }
  if (browsing) { caption = ""; chip = ""; }
  const callFrac = phase === "calling" ? (booking ? 0.7 : Math.min(0.6, (Date.now() - t0.current) / 60000)) : 0;
  const cur = phase === "calling" ? 0 : phase === "auto" ? Math.max(0, sc - 1) : phase === "end" ? 7 : -1;
  const seg0 = phase === "calling" ? callFrac : phase === "auto" && sc === 1 ? 0.7 + 0.3 * frac : 1;
  const segs = ["Call & booking", ...SCENES.slice(1).map((s) => s[0])].map((label, i) => ({
    label, current: i === cur, fill: phase === "end" || i < cur ? 1 : i === cur ? (i === 0 ? seg0 : frac) : 0,
  }));
  const hideOn = hideSet ?? (sc === 7 && phase === "auto" && frac >= 0.5);
  const spotTarget = browsing ? "" : phase === "calling" ? (booking ? "appt" : "call") : phase === "auto" ? ["", "appt", "job", "", "", "total", "find", "toggle"][sc] : "";

  return <main className="sld">
    <style>{CSS}</style>
    <header className="sld-top">
      <strong style={{ color: "var(--accent)" }}>Luxor</strong>
      {phase !== "start" && <>
        <span className="sld-top-biz">· {name}</span>
        <button type="button" className="button" style={{ marginLeft: "auto", borderRadius: 999 }} onClick={() => { void conversation.current?.endSession(); setPhase("end"); setExploring(false); setBrowse(null); }}>Get this for {name}</button>
      </>}
    </header>

    {phase === "start" && <div className="sld-start">
      <div className="sld-hero" aria-hidden="true"><span className="sld-orb" /><p>Hi, I&apos;m Alice. I answer your phone.</p></div>
      <h1>24-Hour English &amp; Spanish Support for Your Customers</h1>
      <form className="panel sld-form" onSubmit={start}>
        <label className="field">Your business name<input value={biz} onChange={(e) => setBiz(e.target.value)} maxLength={80} autoComplete="organization" required /></label>
        <label className="field">Phone or email <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span><input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={254} autoComplete="email" /></label>
        <button className="button primary sld-big" disabled={busy}>{busy ? "Opening…" : "Start my demo"}</button>
        {error && <p role="alert" className="sld-error">{error}</p>}
        <p className="sld-small">Free · no signup</p>
      </form>
    </div>}

    {phase !== "start" && <div className="sld-body">
      <aside className={`sld-rail${phase === "auto" ? " is-auto" : ""}`} aria-label="Demo controls">
        {phase === "choose" && <div className="panel sld-card sld-card-active">
          <h2>Call {name}</h2>
          <div className="sld-say"><strong>You&apos;re the customer. Try saying:</strong><p>&ldquo;Hi, my roof is leaking near the chimney. Can someone come Friday morning?&rdquo;</p></div>
          <button type="button" className="button primary sld-big" disabled={!trialReady} onClick={() => begin("talk")}>Talk to Alice</button>
          <a className="button" href={DEMO_TEL} aria-disabled={!trialReady} onClick={(e) => { if (!trialReady) { e.preventDefault(); return; } begin("dial"); }} style={{ textDecoration: "none", justifyContent: "center" }}>Or dial {DEMO_PHONE}</a>
          <button type="button" className="sld-link" onClick={() => begin("watch")}>Just watch</button>
          {error && <p role="alert" className="sld-error">{error}</p>}
          {/* Live calls are capped per day (cost guard); the read-only sample app has no budget and never calls anyone. */}
          {!trialReady && <EnterSandboxButton vertical="roofing" destination="bookings" label="Open Sample App" />}
        </div>}

        {phase === "calling" && <div className="sld-call" data-testid="demo-call-panel">
          <div className="sld-call-head">
            <span className="sld-tag" style={{ background: booking ? "var(--accent)" : "#dc2626" }}>{booking ? "BOOKED" : "LIVE PHONE CALL"}</span>
            <strong>{mode === "dial" ? (callState === "waiting-phone" ? `Call ${DEMO_PHONE} now` : "On your phone with Alice") : callState === "connecting" ? "Connecting…" : "Alice is answering"}</strong>
            {sample && <span className="sld-sample">Sample call</span>}
          </div>
          <div className="sld-captions" aria-live="polite">
            {mode === "dial" && !captions.length && <p className="sld-caption-wait">{callState === "waiting-phone" ? "This screen follows your call." : "Talk to Alice. Your booking appears here."}</p>}
            {captions.slice(-2).map((c, i) => <div key={`${captions.length}-${i}`} className="sld-pop"><span>{c.who}</span><p>{c.text}</p></div>)}
          </div>
          {booking && <button type="button" className="button primary sld-big" onClick={() => startAuto(1)}>See what happens next</button>}
          {!sample && <button type="button" className="button" onClick={endCall}>{mode === "dial" ? "Cancel" : "End call"}</button>}
        </div>}

        {phase === "auto" && <div className="panel sld-card">
          <h2>Your office, on autopilot</h2>
          <ol className="sld-steps">
            {SCENES.map(([label], i) => {
              const n = i + 1, now = n === scene, done = n < scene;
              return <li key={label}><button type="button" aria-current={now ? "step" : undefined} className={now ? "is-now" : ""} onClick={() => startAuto(n)}><span className={done || now ? "is-on" : ""}>{done ? "✓" : n}</span>{label}</button></li>;
            })}
          </ol>
          <div className="sld-controls">
            <button type="button" className="button" onClick={() => { setScene(Math.max(1, scene - 1)); setMs(0); }}>‹ Back</button>
            <button type="button" className="button" onClick={() => setPaused(!paused)}>{paused ? "Play" : "Pause"}</button>
            <button type="button" className="button primary" onClick={() => { if (scene >= 7) setPhase("end"); else { setScene(scene + 1); setMs(0); } }}>Next ›</button>
          </div>
        </div>}

      </aside>

      <DemoStage
        name={name} screen={screen} tab={tab} browsing={browsing} caption={caption} chip={chip} segs={segs}
        spotTarget={spotTarget} sc={sc} frac={frac} phase={phase} booked={booked} customer={customer}
        when={booking?.when || SAMPLE_BOOKING.when} address={booking?.address || SAMPLE_BOOKING.address}
        callerShown={captions.length ? customer : "Incoming call"} lastLine={captions[captions.length - 1]?.text || "Ringing…"}
        callKind={sample ? "Sample call" : mode === "dial" ? "Phone call" : "Browser call"} lines={lines}
        hideOn={hideOn} onToggleHide={() => setHideSet(!hideOn)}
        onNav={(id) => { setBrowse(id); setBrowseTab("log"); }} onTab={(t) => { setBrowse("job"); setBrowseTab(t); }}
        onResume={() => { setBrowse(null); setExploring(false); }} resumeLabel={phase === "auto" ? "Resume demo" : phase === "end" ? "Back to summary" : "Back"}
        endCard={phase === "end" && !exploring ? <div className="sld-end" role="dialog" aria-label="Your demo summary">
          <div className="sld-end-card sld-pop">
            <h2>{name}: answered, booked and invoiced.</h2>
            <p>Call → lead → booked appointment: <strong>{bookedSecs || "—"} seconds</strong></p>
            <a className="button primary sld-big" href={bookCallUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", justifyContent: "center" }}>Book a call with us</a>
            {reach === "closed" && <button type="button" className="button" onClick={() => setReach("open")}>Have us reach you</button>}
            {reach === "open" && <div className="sld-reach">
              <input aria-label="Your phone or email" placeholder="Your phone or email" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={254} />
              <button type="button" className="button primary" onClick={sendReach}>Send</button>
            </div>}
            {reach === "sent" && <p className="sld-done">Done. We&apos;ll reach out {new Date().getHours() < 17 ? "today" : "tomorrow"}.</p>}
            {reachError && <p role="alert" className="sld-error">{reachError}</p>}
            <div className="sld-end-links">
              <button type="button" className="sld-link" onClick={() => { setExploring(true); setBrowse("dash"); }}>Explore the app</button>
              <button type="button" className="sld-link" onClick={() => begin(mode)}>Watch again</button>
            </div>
          </div>
        </div> : null}
      />
    </div>}
  </main>;
}

function sampleScript(name: string): Caption[] {
  return [
    { who: "Alice", text: `Thanks for calling ${name}, this is Alice. How can I help?` },
    { who: "Customer", text: "Hi, it's Sam Rivera. My roof is leaking near the chimney. Can someone come Friday morning?" },
    { who: "Alice", text: "Sorry about that, Sam. I have Friday at 10 AM. Does that work?" },
    { who: "Customer", text: "Yes, perfect." },
    { who: "Alice", text: "You're booked for Friday at 10. It's in the app now." },
  ];
}

const CSS = `
.sld{min-height:100vh;box-sizing:border-box;padding:16px;max-width:1440px;margin:0 auto;display:flex;flex-direction:column;gap:14px;background:var(--background)}
.sld-top{display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-height:44px}
.sld-top-biz{color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:50vw}
.sld-start{width:100%;max-width:620px;margin:8px auto 40px;display:flex;flex-direction:column;gap:20px}
.sld-start h1{margin:0;text-align:center;font-size:28px;line-height:1.2;font-weight:800;color:var(--text)}
.sld-hero{position:relative;height:200px;border-radius:20px;overflow:hidden;background:radial-gradient(ellipse at 50% 45%,#12343a 0%,#0b1d24 55%,#081419 100%);display:grid;place-items:center}
.sld-hero p{position:absolute;left:16px;right:16px;bottom:18px;margin:0;text-align:center;color:#e6fffb;font-size:17px;font-weight:600}
.sld-orb{width:84px;height:84px;margin-top:-28px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#99f6e4 0%,#2dd4bf 30%,#0f766e 70%,#0b3b3a 100%);box-shadow:0 0 36px rgba(45,212,191,.7);animation:sld-glow 2.4s ease-in-out infinite}
.sld-form{display:grid;gap:12px;padding:22px}
.sld-big{min-height:54px;font-size:17px;font-weight:800;justify-content:center}
.sld-small{margin:0;text-align:center;font-size:13px;color:var(--text-muted)}
.sld-error{margin:0;color:var(--danger,#b91c1c);font-size:14px;line-height:1.4}
.sld-body{display:flex;flex-wrap:wrap;gap:16px;align-items:stretch;flex:1}
.sld-rail{flex:1 1 300px;max-width:100%;min-width:0;display:flex;flex-direction:column;gap:14px}
.sld-card{display:grid;gap:12px;padding:20px}
.sld-card h2{margin:0;font-size:21px}
.sld-card-active{border:2px solid var(--accent)}
.sld-say{padding:14px;border-radius:12px;background:var(--accent-soft)}
.sld-say strong{font-size:13px;color:var(--accent-dark)}
.sld-say p{margin:4px 0 0;font-size:16px;line-height:1.45}
.sld-link{border:0;background:none;color:var(--accent);font-weight:700;font-size:15px;text-decoration:underline;min-height:44px;cursor:pointer}
.sld-call{padding:20px;border-radius:16px;background:#0b1d24;color:#e2e8f0;display:grid;gap:14px}
.sld-call .button:not(.primary){background:transparent;color:#e2e8f0;border-color:#334155}
.sld-call-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.sld-tag{font-size:12px;font-weight:800;letter-spacing:.06em;padding:3px 9px;border-radius:999px;color:#fff}
.sld-sample{margin-left:auto;font-size:12px;color:#fcd34d;border:1px solid #a16207;border-radius:999px;padding:2px 9px}
.sld-captions{display:grid;gap:12px;min-height:150px;align-content:end}
.sld-captions span{display:block;font-size:12px;font-weight:700;color:#5eead4;margin-bottom:2px}
.sld-captions p{margin:0;font-size:20px;line-height:1.35;color:#fff}
.sld-caption-wait{color:#94a3b8!important;font-size:16px!important}
.sld-steps{margin:0;padding:0;list-style:none;display:grid;gap:4px}
.sld-steps button{display:flex;align-items:center;gap:10px;width:100%;min-height:40px;padding:0 10px;border:0;border-radius:10px;background:transparent;text-align:left;font-size:15px;color:var(--text);cursor:pointer}
.sld-steps button.is-now{font-weight:800;background:var(--accent-soft);color:var(--accent)}
.sld-steps button span{display:grid;place-items:center;flex:none;width:24px;height:24px;border-radius:50%;font-size:12px;font-weight:800;background:var(--border);color:var(--text-muted)}
.sld-steps button span.is-on{background:var(--accent);color:#fff}
.sld-controls{display:flex;gap:8px}.sld-controls .button{flex:1;justify-content:center}
.sld-end{position:absolute;inset:0;z-index:10;display:grid;place-items:center;padding:16px;box-sizing:border-box;background:rgba(8,20,25,.55)}
.sld-end-card{width:100%;max-width:480px;box-sizing:border-box;padding:26px;border-radius:20px;background:var(--surface);display:grid;gap:12px;text-align:center}
.sld-end-card h2{margin:0;font-size:24px;line-height:1.25}
.sld-end-card p{margin:0;font-size:16px;color:var(--text-muted)}
.sld-end-card .button{justify-content:center;min-height:48px}
.sld-reach{display:flex;gap:8px}.sld-reach input{flex:1;min-width:0;min-height:48px;padding:0 12px;border:1px solid var(--border);border-radius:10px;font-size:16px}
.sld-done{color:var(--accent-dark)!important;font-weight:700}
.sld-end-links{display:flex;justify-content:center;gap:18px}
.sld-pop{animation:sld-pop .6s ease-out both}
@keyframes sld-pop{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes sld-glow{50%{box-shadow:0 0 0 10px rgba(45,212,191,.18),0 0 36px rgba(45,212,191,.7)}}
@keyframes sld-blink{50%{opacity:.35}}
@media (max-width:640px){.sld-rail.is-auto{order:2}.sld-rail.is-auto h2,.sld-rail.is-auto .sld-steps{display:none}.sld-rail.is-auto .sld-card{padding:12px}}
@media (prefers-reduced-motion:reduce){.sld *{animation:none!important;transition:none!important}}
`;

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Mic, CalendarDays, PhoneOff, PhoneCall } from "lucide-react";
import type { VoiceConversation } from "@elevenlabs/client";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Modal } from "@/components/ui/Modal";

type Intent = "call" | "phone" | "bookings" | "field";
interface Session { token: string; name: string; companyName: string; email: string | null; businessId: string; expiresAt: number; callsLeft: number; notesLeft: number }
async function action(body: Record<string, unknown>) {
  const response = await fetch("/api/demo/roofing-trial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not open your demo. Please try again.");
  return data;
}
export async function openPrivateFieldDemo() {
  const data = await action({ action: "field" });
  window.location.assign(data.url);
}

export function RoofingTrial() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCode, setPhoneCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [callState, setCallState] = useState<"idle" | "connecting" | "connected" | "ended">("idle");
  const [lastMessage, setLastMessage] = useState("");
  const conversation = useRef<VoiceConversation | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    let cancelled = false; mounted.current = true;
    fetch("/api/demo/roofing-trial", { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).then((data) => { if (!cancelled && data.token) setSession(data); }).catch(() => {})
      .finally(() => { if (!cancelled) setSessionReady(true); });
    return () => { cancelled = true; mounted.current = false; if (timer.current) clearTimeout(timer.current); void conversation.current?.endSession(); };
  }, []);
  useEffect(() => {
    if (!phoneCode) return;
    const expiry = setTimeout(() => setPhoneCode(null), Math.max(0, phoneCode.expiresAt - Date.now()));
    return () => clearTimeout(expiry);
  }, [phoneCode]);

  async function signIn(data: Session) {
    const auth = await getFirebaseAuth();
    if (!auth) throw new Error("Sign-in is unavailable. Please try again.");
    const { signInWithCustomToken, setPersistence, browserSessionPersistence } = await import("firebase/auth");
    await setPersistence(auth, browserSessionPersistence);
    const signed = await signInWithCustomToken(auth, data.token);
    const token = await signed.user.getIdToken();
    document.cookie = `__session=${token}; path=/; max-age=3600; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
    try { localStorage.setItem("luxorFieldWorkerName", data.name); } catch { /* optional name convenience */ }
  }
  async function startCall() {
    setCallState("connecting"); setLastMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const data = await action({ action: "call" });
      const { Conversation } = await import("@elevenlabs/client");
      const started = await Conversation.startSession({ signedUrl: data.signedUrl, connectionType: "websocket", textOnly: false as const,
        workletPaths: { rawAudioProcessor: "/voice-worklets/rawAudioProcessor.js", audioConcatProcessor: "/voice-worklets/audioConcatProcessor.js" },
        libsampleratePath: "/voice-worklets/libsamplerate.worklet.js",
        dynamicVariables: data.dynamicVariables,
        overrides: { agent: { prompt: { prompt: data.prompt }, firstMessage: data.firstMessage, language: "en" } },
        onConnect: () => setCallState("connected"),
        onMessage: (message) => { if (message.source === "ai") setLastMessage(message.message); },
        onDisconnect: () => { conversation.current = null; setCallState("ended"); if (timer.current) clearTimeout(timer.current); },
        onError: () => { setError("The call disconnected. Check microphone access and try again."); setCallState("ended"); },
      });
      conversation.current = started;
      if (!mounted.current) { await started.endSession(); conversation.current = null; return; }
      timer.current = setTimeout(() => { void conversation.current?.endSession(); }, 180_000);
    } catch (err) {
      setCallState("idle");
      throw new Error(err instanceof Error && /permission|denied|notallowed|microphone/i.test(err.message)
        ? "Allow microphone access and try Call in Browser again, or use the dial-in option below."
        : err instanceof Error ? err.message : "Could not start the call. Please try again.");
    }
  }
  async function proceed(target: Intent, data: Session) {
    setBusy(true); setError("");
    try {
      await signIn(data);
      if (target === "call") await startCall();
      else if (target === "phone") setPhoneCode(await action({ action: "phone" }));
      else if (target === "field") await openPrivateFieldDemo();
      else router.push("/company/pipeline");
    } catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
    finally { setBusy(false); }
  }
  function choose(target: Intent) {
    if (conversation.current || callState === "connecting") return;
    if (session && session.expiresAt > Date.now()) void proceed(target, session);
    else { setError(""); setIntent(target); }
  }
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const data: Session = await action({ action: "create", name, companyName, email });
      if (data.businessId !== session?.businessId) setPhoneCode(null);
      setSession(data); const target = intent; setIntent(null);
      if (target) await proceed(target, data);
    } catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
    finally { setBusy(false); }
  }
  const card: React.CSSProperties = { padding: "18px 16px", textAlign: "center", position: "relative" };
  const number: React.CSSProperties = { display: "grid", placeItems: "center", width: 28, height: 28, margin: "0 auto 8px", borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700 };
  const button: React.CSSProperties = { minHeight: 48, padding: "12px 18px", display: "inline-flex", gap: 8, alignItems: "center", justifyContent: "center", maxWidth: "100%", whiteSpace: "normal", lineHeight: 1.4 };
  const inCall = callState === "connected" || callState === "connecting";
  return <>
    {session && session.expiresAt > Date.now() && <div className="panel" style={{ padding: 12, marginBottom: 12, textAlign: "center" }}>
      <p style={{ margin: "0 0 4px", fontSize: 14 }}>Your demo: <strong>{session.companyName}</strong></p>
      <button className="button ghost" style={{ minHeight: 44 }} disabled={busy || inCall} onClick={() => {
        setName(session.name); setCompanyName(session.companyName); setEmail(session.email || ""); setError(""); setIntent("bookings");
      }}>Change Demo Details</button>
    </div>}
    <ol aria-label="Try the demo" style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
      <li className="panel" style={card}>
        <span aria-hidden="true" style={number}>1</span>
        <button className="button primary" style={button} disabled={busy || inCall || !sessionReady} onClick={() => choose("call")}><Mic size={18} aria-hidden="true" />{callState === "connecting" ? "Connecting…" : "Call in Browser"}</button>
        <p style={{ margin: "10px 0", fontSize: 13, color: "var(--text-muted)" }}>or</p>
        {phoneCode && !inCall ? <>
          <a className="button" style={{ ...button, textDecoration: "none" }} href="tel:+16892042643"><PhoneCall size={18} aria-hidden="true" />Dial (689) 204-2643</a>
          <div role="status" data-testid="phone-demo-code" style={{ marginTop: 12 }}>
            <p style={{ margin: "0 0 4px", fontSize: 13 }}>Tell Alice your demo code:</p>
            <strong style={{ display: "block", fontSize: 26, letterSpacing: "0.12em" }}>{phoneCode.code}</strong>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-muted)" }}>One use. Valid for up to five minutes.</p>
          </div>
        </> : <button className="button" style={button} disabled={busy || inCall || !sessionReady} onClick={() => choose("phone")}><PhoneCall size={18} aria-hidden="true" />Dial (689) 204-2643</button>}
        <p style={{ margin: "10px 0 0", color: "var(--text-muted)", fontSize: 13 }}>One setup. Both ways use your business name and booking.</p>
        {inCall && <div role="status" style={{ marginTop: 12 }}>
          <p>{callState === "connected" ? `You're speaking with ${session?.companyName || "Alice"}.` : "Opening your microphone…"}</p>
          {lastMessage && <p style={{ fontSize: 13 }}>{lastMessage}</p>}
          <button className="button" style={button} onClick={() => void conversation.current?.endSession()} disabled={!conversation.current}><PhoneOff size={16} />End Call</button>
        </div>}
        {callState === "ended" && <p role="status" style={{ fontSize: 13 }}>Call ended. Continue in the app.</p>}
      </li>
      <li className="panel" style={card}><span aria-hidden="true" style={number}>2</span>
        <button className="button" style={button} disabled={busy || inCall || !sessionReady} onClick={() => choose("bookings")}><CalendarDays size={18} aria-hidden="true" />See Your Booking in the App</button>
      </li>
      <li className="panel" style={card}><span aria-hidden="true" style={number}>3</span>
        <button className="button" style={button} disabled={busy || inCall || !sessionReady} onClick={() => choose("field")}><Mic size={18} aria-hidden="true" />Add a Voice Update</button>
        <p style={{ margin: "10px 0 0", color: "var(--text-muted)", fontSize: 13 }}>Speak your findings. See them saved to your demo job.</p>
      </li>
    </ol>
    {error && <p role="alert" style={{ color: "var(--danger)", textAlign: "center", lineHeight: 1.5 }}>{error}</p>}
    <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>Your private demo lasts one hour: two short calls and three field notes.</p>
    <Modal open={intent !== null} onClose={() => { if (!busy) setIntent(null); }} title="Make It Your Demo">
      <form onSubmit={create} style={{ display: "grid", gap: 14 }}>
        <label className="field">Your Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" required /></label>
        <label className="field">Business Name<input value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={80} autoComplete="organization" required /></label>
        <label className="field">Confirmation Email (Optional)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="email" /></label>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>Alice answers with your business name. Booking confirmations go only to the email you enter here. We keep these details as a demo enquiry.</p>
        {session && <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>Changing these details opens a fresh private demo.</p>}
        <button className="button primary" style={button} disabled={busy}>{busy ? "Opening…" : intent === "phone" ? "Show My Demo Code" : session ? "Save and Open My Demo" : "Start My Demo"}</button>
        {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
      </form>
    </Modal>
  </>;
}

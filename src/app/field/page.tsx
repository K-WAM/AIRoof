"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PhotoCapture } from "@/components/field/PhotoCapture";
import { FieldFindingsButton } from "@/components/field/FindingPickerSheet";
import { TimeClock } from "@/components/field/TimeClock";
import { FieldNoteComposer } from "@/components/field/FieldNoteComposer";
import { RecentNotes } from "@/components/field/RecentNotes";
import type { WorkerDay } from "@/types/timeclock";
import { InstallPrompt } from "@/components/field/InstallPrompt";
import type { Job } from "@/types/jobs";

// ── SVG mic icon ────────────────────────────────────────────────────────────

// One-deploy migration only: old builds stored the reusable field key here.
// Successful bootstrap deletes it; signed access now lives only in HttpOnly cookie.
const ACCESS_STORE = "luxorFieldAccess";

// Per-device remembered name — see the workerName useState's own comment.
const WORKER_NAME_STORE = "luxorFieldWorkerName";

function loadStoredAccess(): { businessId: string; key: string } | null {
  try {
    const raw = localStorage.getItem(ACCESS_STORE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.businessId === "string" && typeof parsed?.key === "string" ? parsed : null;
  } catch {
    return null;
  }
}

// ── Main app ────────────────────────────────────────────────────────────────
function FieldApp() {
  const searchParams = useSearchParams();
  const urlBusinessId = searchParams?.get("businessId");
  const urlKey = searchParams?.get("key");
  const prefillJobId = searchParams?.get("jobId") ?? "";

  const [businessId, setBusinessId] = useState(urlBusinessId ?? "");
  const [bootstrapComplete, setBootstrapComplete] = useState(false);
  // The businessId/jobId a job-scoped QR grant resolves to now arrive via the
  // HttpOnly field-session cookie instead of URL query params (so the address
  // bar can stay a bare "/field" — see /f/[grant] and GET /api/field/session).
  // prefillJobId (from the URL) still covers the legacy ?jobId= link shape;
  // sessionJobId is what the rest of the page actually reads.
  const [sessionJobId, setSessionJobId] = useState(prefillJobId);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [accessDenied, setAccessDenied] = useState(searchParams?.get("access") === "denied");
  const [selectedJobId, setSelectedJobId] = useState(prefillJobId);
  // Remembered per-device so a returning crew member never has to retype it — this is the
  // anonymous QR path (no login), so a name field with no memory at all meant everyone typed
  // their name fresh on every single visit. Hydrated lazily (not in an effect) so it's already
  // correct on the very first paint, before the mic button is even usable.
  const [workerName, setWorkerName] = useState(() => {
    try { return localStorage.getItem(WORKER_NAME_STORE) ?? ""; } catch { return ""; }
  });
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [notesVersion, setNotesVersion] = useState(0);
  const [clockedInJobId, setClockedInJobId] = useState<string | null>(null);

  // New QR links arrive through the server exchange redirect and already have an
  // HttpOnly cookie. Old ?key= links/localStorage entries get one migration POST.
  // Strip browser-visible credentials before making any application API request.
  useEffect(() => {
    const cleanUrl = new URL(window.location.href);
    const hadCredential = ["key", "grant", "token"].some((name) => cleanUrl.searchParams.has(name));
    for (const name of ["key", "grant", "token"]) cleanUrl.searchParams.delete(name);
    if (hadCredential) {
      window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }

    const stored = loadStoredAccess();
    const legacy = urlKey && urlBusinessId
      ? { businessId: urlBusinessId, key: urlKey }
      : stored && (!urlBusinessId || stored.businessId === urlBusinessId)
        ? stored
        : null;
    try {
      localStorage.removeItem(ACCESS_STORE);
    } catch {}

    if (!legacy) {
      // No old-style ?key= credential. If the URL also has no explicit
      // ?businessId= (the new short-QR flow: /f/[grant] already redirected
      // here to a bare "/field" and set the HttpOnly session cookie), ask the
      // cookie what business/job it's scoped to. A direct link that already
      // names ?businessId= (bookmarks, dev/demo) keeps working unchanged and
      // skips this call.
      if (urlBusinessId) {
        setBootstrapComplete(true);
        return;
      }
      let cancelled = false;
      fetch("/api/field/session", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .then((session: { businessId: string; jobId: string | null } | null) => {
          if (cancelled || !session) return;
          setBusinessId(session.businessId);
          if (session.jobId) {
            setSessionJobId(session.jobId);
            setSelectedJobId(session.jobId);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setBootstrapComplete(true);
        });
      return () => { cancelled = true; };
    }

    let cancelled = false;
    fetch("/api/field/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId: legacy.businessId,
        key: legacy.key,
        ...(prefillJobId ? { jobId: prefillJobId } : {}),
      }),
    })
      .then((response) => {
        if (!cancelled && !response.ok) setAccessDenied(true);
      })
      .catch(() => {
        if (!cancelled) setAccessDenied(true);
      })
      .finally(() => {
        if (!cancelled) {
          setBusinessId(legacy.businessId);
          setBootstrapComplete(true);
        }
      });

    return () => { cancelled = true; };
  }, [prefillJobId, urlBusinessId, urlKey]);

  // Load jobs
  useEffect(() => {
    if (!bootstrapComplete || !businessId) return;
    setLoadingJobs(true);
    const jobsUrl = sessionJobId
      ? `/api/jobs/${encodeURIComponent(sessionJobId)}?businessId=${encodeURIComponent(businessId)}`
      : `/api/jobs?businessId=${encodeURIComponent(businessId)}`;
    fetch(jobsUrl)
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          setAccessDenied(true);
          return { jobs: [] };
        }
        setAccessDenied(false);
        return r.json();
      })
      .then((d) => {
        const loaded = d.job ? [d.job as Job] : (d.jobs ?? []) as Job[];
        const open = loaded.filter((j) => j.status !== "complete" && j.status !== "invoiced");
        setJobs(open);
        if (sessionJobId && open.find((j) => j.jobId === sessionJobId)) setSelectedJobId(sessionJobId);
        else if (open.length === 1) setSelectedJobId((current) => current || open[0].jobId);
      })
      .catch(console.error)
      .finally(() => setLoadingJobs(false));
  }, [bootstrapComplete, businessId, sessionJobId]);

  // Remember the worker's name on this device for next time (see the useState above).
  useEffect(() => {
    try {
      if (workerName.trim()) localStorage.setItem(WORKER_NAME_STORE, workerName);
      else localStorage.removeItem(WORKER_NAME_STORE);
    } catch {}
  }, [workerName]);

  const selectedJob = jobs.find((j) => j.jobId === selectedJobId);
  const hasWorkerName = workerName.trim().length > 0;
  // Photo / finding confirmations (notes have their own receipt in the composer).
  function flashSaved(summary: string) {
    setSavedNote(summary);
    setTimeout(() => setSavedNote(null), 4000);
  }
  const handleDay = useCallback((day: WorkerDay) => {
    const open = day.state === "site" || day.state === "site_break" ? day.openJobId ?? null : null;
    setClockedInJobId(open);
  }, []);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html, body { margin: 0; min-height: 100dvh; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif; background: #0a0e1a; color: #e2e8f0; }
      `}</style>

      <div className="field-public-page" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#0a0e1a", padding: "0 0 env(safe-area-inset-bottom,0)" }}>

        {/* Header */}
        <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #1e2a4a" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em", color: "#f8fafc" }}>Luxor Field</span>
        </div>

        {!accessDenied && <InstallPrompt />}

        <div className="field-public-content" style={{ flex: 1, padding: "20px 20px 16px", maxWidth: 480, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Access denied — expired/missing key */}
          {accessDenied && (
            <div style={{ padding: "16px", background: "#2d0f0f", border: "1px solid #7f1d1d", borderRadius: 14 }}>
              <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "#fca5a5" }}>This link isn&apos;t active</p>
              <p style={{ margin: 0, fontSize: 13, color: "#f1a8a8", lineHeight: 1.5 }}>
                Scan the current QR code from the office to open the field screen. If you keep seeing this, ask the office for a fresh field link.
              </p>
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "#f1a8a8" }}>
                Have a login? <a href="/company/field" style={{ color: "#fecaca", fontWeight: 700 }}>Sign in to the field screen</a>
              </p>
            </div>
          )}

          {/* Without access every control below is dead (no jobs, nothing saves) — show only the way back in. */}
          {!accessDenied && <>
          {/* 1. Who you are — first, because every note, photo and clock tap carries it. Remembered on this phone. */}
          <div>
            <label htmlFor="field-worker-name" style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 6 }}>Your name</label>
            <input
              id="field-worker-name"
              required
              autoComplete="name"
              value={workerName}
              onChange={e => setWorkerName(e.target.value)}
              placeholder="First and last name"
              maxLength={80}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 12,
                border: `1.5px solid ${hasWorkerName ? "#1e2a4a" : "#b45309"}`, fontSize: 15, color: "#e2e8f0",
                background: "#0f172a", outline: "none",
              }}
            />
            {!hasWorkerName && (
              <p role="status" style={{ margin: "6px 0 0", fontSize: 13, color: "#fbbf24" }}>
                Type your name so the office knows who sent each note. This phone remembers it.
              </p>
            )}
          </div>

          {/* 2. Which job */}
          <div>
            <label htmlFor="field-job" style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 6 }}>Job</label>
            <div style={{ position: "relative" }}>
              <select
                id="field-job"
                value={selectedJobId}
                onChange={e => setSelectedJobId(e.target.value)}
                disabled={loadingJobs || jobs.length <= 1}
                style={{
                  width: "100%", padding: "13px 40px 13px 16px", borderRadius: 14,
                  border: "1.5px solid #1e2a4a", fontSize: 15, fontWeight: 600,
                  color: selectedJobId ? "#f1f5f9" : "#94a3b8",
                  background: "#0f172a", appearance: "none", WebkitAppearance: "none",
                  cursor: loadingJobs || jobs.length <= 1 ? "default" : "pointer", outline: "none",
                }}
              >
                {loadingJobs ? <option>Loading jobs…</option>
                  : jobs.length === 0 ? <option value="">No open job on this link</option>
                  : <><option value="">Choose the job you&apos;re at…</option>{jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId} — {j.title}</option>)}</>}
              </select>
              {jobs.length > 1 && <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#475569", pointerEvents: "none", fontSize: 12 }}>▾</div>}
            </div>
          </div>

          {/* 3. Hours */}
          {bootstrapComplete && businessId && hasWorkerName && (
            <TimeClock businessId={businessId} jobId={selectedJobId || null} workerName={workerName} onDayChange={handleDay} />
          )}

          {/* 4. Notes — the composer shows the job + name before anything is said, and a receipt after */}
          <FieldNoteComposer
            businessId={businessId || null}
            // The QR link already names the job: use it straight away, before the job details finish loading.
            job={selectedJob ? { jobId: selectedJob.jobId, title: selectedJob.title, address: selectedJob.address } : selectedJobId ? { jobId: selectedJobId } : null}
            authorName={workerName.trim()}
            blockedReason={!hasWorkerName ? "Type your name above first" : null}
            clockedInJobId={clockedInJobId}
            onSaved={() => setNotesVersion((v) => v + 1)}
          />

          {/* Photo and Finding side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <PhotoCapture
              jobId={selectedJobId || null}
              businessId={businessId}
              submittedBy={workerName.trim() || undefined}
              disabled={!hasWorkerName}
              onUploaded={() => flashSaved(`Photo saved to ${selectedJobId}`)}
            />
            <FieldFindingsButton
              jobId={selectedJobId || null}
              businessId={businessId}
              disabled={!hasWorkerName}
              onAdded={(problem) => flashSaved(`Finding added to ${selectedJobId}: ${problem}`)}
            />
          </div>

          {savedNote && (
            <div role="status" style={{ padding: "10px 14px", background: "#0f2d1a", border: "1px solid #166534", borderRadius: 10, fontSize: 13, color: "#86efac", fontWeight: 600 }}>
              ✓ {savedNote}
            </div>
          )}

          <RecentNotes businessId={businessId || null} jobId={selectedJobId || null} refreshKey={notesVersion} />
          </>}

        </div>
      </div>
    </>
  );
}

export default function FieldPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0e1a" }}>
        <div style={{ color: "#334155", fontSize: 14 }}>Loading…</div>
      </div>
    }>
      <FieldApp />
    </Suspense>
  );
}

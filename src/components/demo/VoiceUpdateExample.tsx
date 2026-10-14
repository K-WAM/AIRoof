import { Mic } from "lucide-react";

/** An explicit illustration, never a recorder or a substitute for a saved field update. */
export function VoiceUpdateExample() {
  return (
    <section aria-labelledby="voice-example-title" data-testid="voice-update-example" style={{ marginBottom: 20, padding: 16, borderRadius: 14, border: "1px solid #334155", background: "#1e293b", color: "#f8fafc" }}>
      <p style={{ margin: "0 0 6px", fontSize: 12, color: "#cbd5e1" }}>Example · No recording</p>
      <h2 id="voice-example-title" style={{ margin: "0 0 12px", fontSize: 19, lineHeight: 1.3 }}>Speak once. Update the job.</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700 }}><Mic size={17} aria-hidden="true" />Crew says</div>
      <blockquote style={{ margin: "8px 0 16px", fontSize: 15, lineHeight: 1.5 }}>
        &ldquo;Used 12 bundles of shingles. Carlos worked 8 hours. Found a cracked vent boot.&rdquo;
      </blockquote>
      <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>Office sees on the job</h3>
      <dl style={{ margin: 0, display: "grid", gap: 8, fontSize: 14 }}>
        {[["Materials", "12 bundles of shingles"], ["Hours", "Carlos · 8 hours"], ["Needs attention", "Cracked vent boot"]].map(([label, value]) => (
          <div key={label} style={{ display: "grid", gap: 2, padding: "8px 10px", borderRadius: 8, background: "#0f172a" }}>
            <dt style={{ fontSize: 12, color: "#94a3b8" }}>{label}</dt><dd style={{ margin: 0 }}>{value}</dd>
          </div>
        ))}
      </dl>
      <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.5, color: "#cbd5e1" }}>Workers open a job link and speak. No signup.</p>
      <p style={{ margin: "4px 0 0", fontSize: 13, color: "#cbd5e1" }}>English or Spanish.</p>
    </section>
  );
}

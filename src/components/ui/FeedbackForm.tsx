"use client";

import { useState, useRef } from "react";
import { X, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const MAX_MESSAGE_LENGTH = 2000;

const CATEGORIES = [
  "Bug report",
  "Feature request",
  "Usability",
  "Performance",
  "Documentation",
  "Other",
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function FeedbackForm({ open, onClose }: Props) {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const sending = useRef(false);

  if (!user || !open) return null;

  const userEmail = user.email ?? user.uid;
  const businessId = user.businessId ?? "";

  function reset() {
    setMessage("");
    setCategory("");
    setStatus("idle");
    setErrorMessage("");
    sending.current = false;
  }

  function handleClose() {
    onClose();
    if (status === "sent") {
      setTimeout(reset, 300);
    } else {
      reset();
    }
  }

  async function handleSubmit() {
    const trimmed = message.trim();
    if (!trimmed || sending.current) return;

    sending.current = true;
    setStatus("sending");
    setErrorMessage("");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          message: trimmed,
          category: category || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to send feedback");
      }

      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
      sending.current = false;
    }
  }

  const canSubmit = message.trim().length > 0 && status !== "sending" && status !== "sent";

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Send feedback</h2>
          <button
            type="button"
            onClick={handleClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-muted)" }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {status === "sent" ? (
          <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <p style={{ margin: "0 0 0.5rem", fontWeight: 600, color: "var(--accent)", fontSize: "0.95rem" }}>
              Feedback sent
            </p>
            <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--text-muted)" }}>
              Thank you. We review every submission.
            </p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>
                From
              </label>
              <div style={{
                padding: "0.5rem 0.75rem",
                background: "var(--bg-muted, #f8fafc)",
                borderRadius: 6,
                fontSize: "0.85rem",
                color: "var(--text-muted)",
              }}>
                {userEmail}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle} htmlFor="feedback-category">
                Category <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span>
              </label>
              <select
                id="feedback-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={selectStyle}
              >
                <option value="">General feedback</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle} htmlFor="feedback-message">
                Message
              </label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                placeholder="What's on your mind?"
                rows={5}
                maxLength={MAX_MESSAGE_LENGTH}
                disabled={status === "sending"}
                autoFocus
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  minHeight: 100,
                }}
              />
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4, textAlign: "right" }}>
                {message.length}/{MAX_MESSAGE_LENGTH}
              </div>
            </div>

            {status === "error" && (
              <div style={{
                padding: "0.5rem 0.75rem",
                background: "var(--c-danger-bg, #fef2f2)",
                border: "1px solid var(--c-danger-bd, #fecaca)",
                borderRadius: 6,
                fontSize: "0.83rem",
                color: "var(--c-danger-fg, #dc2626)",
                marginBottom: 12,
              }}>
                {errorMessage}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={status === "sending"}
                className="button secondary small"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="button primary small"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Send size={14} />
                {status === "sending" ? "Sending..." : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  boxShadow: "var(--shadow-lg)",
  padding: "1.5rem",
  maxWidth: 460,
  width: "calc(100% - 2rem)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "var(--text-muted)",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: "0.88rem",
  fontFamily: "inherit",
  color: "var(--text, #1e293b)",
  background: "var(--surface)",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

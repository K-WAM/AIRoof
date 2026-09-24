"use client";

import { useState, useRef } from "react";
import { Send } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
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

/**
 * Client-facing feedback, sent to the Luxor team (T-044/T-114). Deliberately
 * not mounted for superadmins — the navs gate it (see admin-nav/hub-nav/
 * company-nav), and this component itself bails out for them as a second
 * guard. Uses the shared Modal shell so spacing/backdrop/close/focus behavior
 * matches every other dialog.
 */
export function FeedbackForm({ open, onClose }: Props) {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const sending = useRef(false);

  if (!user || user.superadmin || !open) return null;

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
        throw new Error(data.error ?? "We couldn't send your message. Please try again.");
      }

      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong — please try again.");
      sending.current = false;
    }
  }

  const canSubmit = message.trim().length > 0 && status !== "sending" && status !== "sent";

  return (
    <Modal open={open} onClose={handleClose} title="Send feedback to Luxor">
      {status === "sent" ? (
        <div style={{ textAlign: "center", padding: "0.5rem 0" }}>
          <p style={{ margin: "0 0 0.5rem", fontWeight: 600, color: "var(--accent)", fontSize: "0.95rem" }}>
            Thanks — we read every message
          </p>
          <p style={{ margin: "0 0 16px", fontSize: "0.83rem", color: "var(--text-muted)" }}>
            The Luxor team will reply to {userEmail} if a response is needed.
          </p>
          <button type="button" className="button primary small" onClick={handleClose}>
            Close
          </button>
        </div>
      ) : (
        <>
          <p style={{ margin: "0 0 14px", fontSize: "0.83rem", color: "var(--text-muted)" }}>
            This message goes to the Luxor team — not to your own company.
          </p>

          <div style={{ marginBottom: 12 }}>
            <span style={labelStyle}>We&apos;ll reply to</span>
            <div style={readOnlyStyle}>{userEmail}</div>
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
            <div
              role="alert"
              style={{
                padding: "0.5rem 0.75rem",
                background: "var(--c-danger-bg)",
                border: "1px solid var(--c-danger-bd)",
                borderRadius: 6,
                fontSize: "0.83rem",
                color: "var(--c-danger-fg)",
                marginBottom: 12,
              }}
            >
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
    </Modal>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "var(--text-muted)",
  marginBottom: 4,
};

const readOnlyStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  background: "var(--surface-muted)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: "0.85rem",
  color: "var(--text-muted)",
  overflowWrap: "anywhere",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: "0.88rem",
  fontFamily: "inherit",
  color: "var(--text)",
  background: "var(--surface)",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

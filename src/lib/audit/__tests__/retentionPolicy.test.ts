import { describe, expect, it } from "vitest";
import {
  buildCallRedactionPlan,
  buildToolIoRedactionPlan,
  CONSERVATIVE_RETENTION_DEFAULTS,
  digestAuditValue,
  getRetentionPolicy,
} from "@/lib/audit";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 6, 21);

describe("retention policy", () => {
  it("uses flagged conservative 90-day defaults", () => {
    expect(getRetentionPolicy({})).toEqual({
      transcriptDays: 90,
      recordingDays: 90,
      toolIoDays: 90,
      ownerSignOffRequired: true,
    });
    expect(CONSERVATIVE_RETENTION_DEFAULTS.ownerSignOffRequired).toBe(true);
  });

  it("loads independent configured windows", () => {
    expect(getRetentionPolicy({
      RETENTION_TRANSCRIPTS_DAYS: "30",
      RETENTION_RECORDINGS_DAYS: "60",
      RETENTION_TOOL_IO_DAYS: "120",
    })).toMatchObject({ transcriptDays: 30, recordingDays: 60, toolIoDays: 120 });
  });

  it.each(["0", "1.5", "not-a-number", "3651"])(
    "fails closed for invalid retention value %s",
    (value) => {
      expect(() => getRetentionPolicy({ RETENTION_TRANSCRIPTS_DAYS: value })).toThrow(
        "RETENTION_TRANSCRIPTS_DAYS"
      );
    }
  );
});

describe("privacy redaction plans", () => {
  const policy = getRetentionPolicy({});

  it("never marks an active call eligible", () => {
    expect(buildCallRedactionPlan({
      status: "active",
      endedAt: now - 365 * DAY_MS,
      messages: [{ role: "caller", text: "private" }],
      recordingUrl: "https://private.example/recording",
    }, now, policy)).toBeNull();
  });

  it("redacts only categories whose independent window has elapsed", () => {
    const configured = getRetentionPolicy({
      RETENTION_TRANSCRIPTS_DAYS: "30",
      RETENTION_RECORDINGS_DAYS: "120",
      RETENTION_TOOL_IO_DAYS: "90",
    });
    const plan = buildCallRedactionPlan({
      status: "ended",
      endedAt: now - 60 * DAY_MS,
      messages: [{ role: "caller", text: "private transcript" }],
      recordingUrl: "https://private.example/recording",
    }, now, configured);

    expect(plan?.fieldsToDelete).toEqual(["messages"]);
    expect(plan?.skeleton.transcript).toBeDefined();
    expect(plan?.skeleton.recording).toBeUndefined();
  });

  it("keeps hashes and lengths without retaining PII", () => {
    const privateValue = { caller: "Alice", text: "My address is 123 Secret Lane" };
    const digest = digestAuditValue(privateValue);

    expect(digest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(digest.byteLength).toBeGreaterThan(0);
    expect(JSON.stringify(digest)).not.toContain("Alice");
    expect(JSON.stringify(digest)).not.toContain("Secret Lane");
  });

  it("is idempotent after transcript and recording fields are gone", () => {
    const redacted = {
      status: "ended",
      endedAt: now - 100 * DAY_MS,
      retention: { version: 1 },
    };
    expect(buildCallRedactionPlan(redacted, now, policy)).toBeNull();
  });

  it("redacts old tool input/output but not recent logs", () => {
    expect(buildToolIoRedactionPlan({
      createdAt: now - 100 * DAY_MS,
      input: { phone: "+16045551234" },
      output: { address: "123 Secret Lane" },
    }, now, policy)?.fieldsToDelete).toEqual(["input", "output"]);

    expect(buildToolIoRedactionPlan({
      createdAt: now - 10 * DAY_MS,
      input: { phone: "+16045551234" },
    }, now, policy)).toBeNull();
  });
});

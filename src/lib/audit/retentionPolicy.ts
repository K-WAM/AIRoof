const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 90;
const MAX_RETENTION_DAYS = 3650;

export interface RetentionPolicy {
  readonly transcriptDays: number;
  readonly recordingDays: number;
  readonly toolIoDays: number;
  readonly ownerSignOffRequired: true;
}

export const CONSERVATIVE_RETENTION_DEFAULTS: RetentionPolicy = Object.freeze({
  transcriptDays: DEFAULT_RETENTION_DAYS,
  recordingDays: DEFAULT_RETENTION_DAYS,
  toolIoDays: DEFAULT_RETENTION_DAYS,
  ownerSignOffRequired: true,
});

function retentionDays(
  value: string | undefined,
  name: string,
  fallback: number
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_RETENTION_DAYS) {
    throw new Error(`${name} must be an integer from 1 to ${MAX_RETENTION_DAYS}`);
  }
  return parsed;
}

export function getRetentionPolicy(
  env: Readonly<Record<string, string | undefined>> = process.env
): RetentionPolicy {
  return Object.freeze({
    transcriptDays: retentionDays(
      env.RETENTION_TRANSCRIPTS_DAYS,
      "RETENTION_TRANSCRIPTS_DAYS",
      CONSERVATIVE_RETENTION_DEFAULTS.transcriptDays
    ),
    recordingDays: retentionDays(
      env.RETENTION_RECORDINGS_DAYS,
      "RETENTION_RECORDINGS_DAYS",
      CONSERVATIVE_RETENTION_DEFAULTS.recordingDays
    ),
    toolIoDays: retentionDays(
      env.RETENTION_TOOL_IO_DAYS,
      "RETENTION_TOOL_IO_DAYS",
      CONSERVATIVE_RETENTION_DEFAULTS.toolIoDays
    ),
    ownerSignOffRequired: true,
  });
}

export function retentionCutoff(now: number, days: number): number {
  return now - days * DAY_MS;
}

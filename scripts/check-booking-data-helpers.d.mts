export interface BookingDataEntry {
  id?: string;
  label?: string;
  kind: string;
  startTime: unknown;
  status?: string;
  source?: string;
}

export function timestampMillis(value: unknown): number | null;
export function formatLocalTime(value: unknown, timeZone: string): string;
export function formatScheduleRow(entry: BookingDataEntry, timeZone: string): string;
export function sortScheduleRows<T extends BookingDataEntry>(entries: readonly T[]): T[];

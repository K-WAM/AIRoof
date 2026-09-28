"use client";

import { useEffect, useMemo, useState } from "react";
import {
  canonicalizeBusinessHours,
  parseBusinessHours,
  validateBusinessHours,
  WEEKDAYS,
  type CanonicalBusinessHours,
  type Weekday,
} from "@/lib/scheduling/hours";

type HoursValue = string | Record<string, string>;

interface HoursEditorProps {
  value: HoursValue;
  onChange: (hours: CanonicalBusinessHours) => void;
  onValidityChange?: (valid: boolean) => void;
  idPrefix?: string;
}

interface RowValue {
  closed: boolean;
  open: string;
  close: string;
}

const DEFAULT_HOURS = canonicalizeBusinessHours("Mon-Fri 8-5")!;

const PRESETS: Array<{ label: string; hours: CanonicalBusinessHours }> = [
  { label: "Mon–Fri 8–5", hours: DEFAULT_HOURS },
  {
    label: "Mon–Sat 7–6",
    hours: Object.fromEntries(WEEKDAYS.map((day) => [day, day === "Sunday" ? "Closed" : "07:00 - 18:00"])) as CanonicalBusinessHours,
  },
  {
    label: "Every day 8–8",
    hours: Object.fromEntries(WEEKDAYS.map((day) => [day, "08:00 - 20:00"])) as CanonicalBusinessHours,
  },
  {
    label: "Open 24 hours (emergency service)",
    hours: Object.fromEntries(WEEKDAYS.map((day) => [day, "00:00 - 24:00"])) as CanonicalBusinessHours,
  },
];

const timeOptions = (includeMidnightEnd = false) => {
  const values = Array.from({ length: 96 }, (_, index) => index * 15);
  if (includeMidnightEnd) values.push(24 * 60);
  return values.map((minutes) => {
    const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const hour24 = Math.floor(minutes / 60);
    const hour12 = hour24 === 0 || hour24 === 24 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    const suffix = hour24 >= 12 && hour24 < 24 ? "PM" : "AM";
    return { value, label: `${hour12}:${String(minutes % 60).padStart(2, "0")} ${suffix}` };
  });
};

const OPEN_OPTIONS = timeOptions();
const CLOSE_OPTIONS = timeOptions(true).slice(1);

function rowsFrom(value: HoursValue): Record<Weekday, RowValue> {
  const parsed = parseBusinessHours(value) ?? parseBusinessHours(DEFAULT_HOURS)!;
  return Object.fromEntries(WEEKDAYS.map((day) => {
    const hours = parsed[day];
    if (!hours) return [day, { closed: true, open: "08:00", close: "17:00" }];
    const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    // Older tenants store the end of an all-day window as 23:59. The editor
    // intentionally offers quarter-hour choices, so present that legacy sentinel
    // as the equivalent selectable end-of-day value instead of letting the browser
    // fall back to the first option (12:15 AM).
    const close = hours.close === (23 * 60) + 59 ? "24:00" : clock(hours.close);
    return [day, { closed: false, open: clock(hours.open), close }];
  })) as Record<Weekday, RowValue>;
}

function canonicalFromRows(rows: Record<Weekday, RowValue>): CanonicalBusinessHours {
  return Object.fromEntries(WEEKDAYS.map((day) => {
    const row = rows[day];
    return [day, row.closed ? "Closed" : `${row.open} - ${row.close}`];
  })) as CanonicalBusinessHours;
}

export function HoursEditor({ value, onChange, onValidityChange, idPrefix = "hours" }: HoursEditorProps) {
  const normalizedValue = useMemo(() => canonicalizeBusinessHours(value) ?? DEFAULT_HOURS, [value]);
  const [rows, setRows] = useState<Record<Weekday, RowValue>>(() => rowsFrom(value));

  useEffect(() => {
    setRows(rowsFrom(normalizedValue));
  }, [normalizedValue]);

  const update = (next: Record<Weekday, RowValue>) => {
    setRows(next);
    const hours = canonicalFromRows(next);
    const validation = validateBusinessHours(hours);
    onValidityChange?.(validation.valid);
    onChange(hours);
  };

  const applyPreset = (hours: CanonicalBusinessHours) => {
    const next = rowsFrom(hours);
    setRows(next);
    onValidityChange?.(true);
    onChange(hours);
  };

  return (
    <div className="hours-editor">
      <fieldset className="hours-presets">
        <legend>Choose a starting schedule</legend>
        <div className="hours-presets-list">
          {PRESETS.map((preset) => (
            <button key={preset.label} type="button" className="button ghost" onClick={() => applyPreset(preset.hours)}>
              {preset.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="hours-days">
        {WEEKDAYS.map((day) => {
          const row = rows[day];
          const invalid = !row.closed && row.close <= row.open;
          const slug = day.toLowerCase();
          return (
            <div className="hours-day" key={day}>
              <div className="hours-day-heading">
                <span>{day}</span>
                <label className="hours-closed" htmlFor={`${idPrefix}-${slug}-closed`}>
                  <input
                    id={`${idPrefix}-${slug}-closed`}
                    type="checkbox"
                    aria-label={`${day} Closed`}
                    checked={row.closed}
                    onChange={(event) => update({ ...rows, [day]: { ...row, closed: event.target.checked } })}
                  />
                  Closed
                </label>
              </div>
              {!row.closed && (
                <div className="hours-time-fields">
                  <label htmlFor={`${idPrefix}-${slug}-open`}>
                    <span>Open</span>
                    <select
                      id={`${idPrefix}-${slug}-open`}
                      aria-label={`${day} Open`}
                      value={row.open}
                      aria-invalid={invalid}
                      onChange={(event) => update({ ...rows, [day]: { ...row, open: event.target.value } })}
                    >
                      {OPEN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label htmlFor={`${idPrefix}-${slug}-close`}>
                    <span>Close</span>
                    <select
                      id={`${idPrefix}-${slug}-close`}
                      aria-label={`${day} Close`}
                      value={row.close}
                      aria-invalid={invalid}
                      aria-describedby={invalid ? `${idPrefix}-${slug}-error` : undefined}
                      onChange={(event) => update({ ...rows, [day]: { ...row, close: event.target.value } })}
                    >
                      {CLOSE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                </div>
              )}
              {invalid && <p className="hours-error" id={`${idPrefix}-${slug}-error`} role="alert">Closing time must be after opening time.</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { DEFAULT_HOURS as DEFAULT_BUSINESS_HOURS };

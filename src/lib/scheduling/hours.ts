export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];
export interface OpenDayHours {
  open: number;
  close: number;
}
export type DayHours = OpenDayHours | null;
export type ParsedBusinessHours = Record<Weekday, DayHours>;
export type CanonicalBusinessHours = Record<Weekday, string>;

export interface BusinessHoursValidation {
  valid: boolean;
  errors: Partial<Record<Weekday | "_root", string>>;
  hours?: CanonicalBusinessHours;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: Weekday;
}

const DAY_ALIASES = new Map<string, Weekday>(
  WEEKDAYS.flatMap((day) => [
    [day.toLowerCase(), day],
    [day.slice(0, 3).toLowerCase(), day],
  ])
);

function emptyWeek(): ParsedBusinessHours {
  return Object.fromEntries(WEEKDAYS.map((day) => [day, null])) as ParsedBusinessHours;
}

function parseClock(value: string): { minutes: number; explicitMeridiem: boolean } | null {
  const match = value.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3];
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem === "pm") hour += 12;
  } else if (hour > 24 || (hour === 24 && minute !== 0)) {
    return null;
  }
  return { minutes: hour * 60 + minute, explicitMeridiem: Boolean(meridiem) };
}

export function parseDayHours(value: unknown): DayHours | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const day = value as { open?: unknown; close?: unknown; closed?: unknown };
    if (day.closed === true) return null;
    if (typeof day.open !== "string" || typeof day.close !== "string") return undefined;
    value = `${day.open} - ${day.close}`;
  }
  if (typeof value !== "string") return undefined;
  if (value.trim().toLowerCase() === "closed") return null;
  const match = value.trim().replace(/[–—]/g, "-").match(/^(.+?)\s*-\s*(.+)$/);
  if (!match) return undefined;
  const openClock = parseClock(match[1]);
  const closeClock = parseClock(match[2]);
  if (!openClock || !closeClock) return undefined;
  let open = openClock.minutes;
  let close = closeClock.minutes;
  // "8-5" is the common, unambiguous daytime shorthand. Do not guess for
  // ranges such as "11-2" or when either side already names AM/PM.
  if (!openClock.explicitMeridiem && !closeClock.explicitMeridiem && close <= open) {
    const openHour = open / 60;
    const closeHour = close / 60;
    if (Number.isInteger(openHour) && Number.isInteger(closeHour) && openHour >= 6 && openHour <= 10 && closeHour >= 1 && closeHour <= 7) {
      close += 12 * 60;
    }
  }
  if (open < 0 || open >= 24 * 60 || close <= open || close > 24 * 60) return undefined;
  return { open, close };
}

function weekdayRange(from: Weekday, to: Weekday): Weekday[] | null {
  const start = WEEKDAYS.indexOf(from);
  const end = WEEKDAYS.indexOf(to);
  if (start < 0 || end < start) return null;
  return WEEKDAYS.slice(start, end + 1);
}

function parseWholeWeek(value: string): ParsedBusinessHours | null {
  const match = value.trim().replace(/[–—]/g, "-").match(/^([A-Za-z]+)(?:\s*-\s*([A-Za-z]+))?\s+(.+)$/);
  if (!match) return null;
  const from = DAY_ALIASES.get(match[1].toLowerCase());
  const to = DAY_ALIASES.get((match[2] ?? match[1]).toLowerCase());
  if (!from || !to) return null;
  const days = weekdayRange(from, to);
  const parsedDay = parseDayHours(match[3]);
  if (!days || parsedDay === undefined) return null;
  const result = emptyWeek();
  for (const day of days) result[day] = parsedDay;
  return result;
}

export function parseBusinessHours(value: unknown): ParsedBusinessHours | null {
  if (typeof value === "string") return parseWholeWeek(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const result = emptyWeek();
  for (const day of WEEKDAYS) {
    const raw = source[day] ?? source[day.toLowerCase()] ?? source[day.slice(0, 3)] ?? source[day.slice(0, 3).toLowerCase()];
    if (raw === undefined) return null;
    const parsed = parseDayHours(raw);
    if (parsed === undefined) return null;
    result[day] = parsed;
  }
  return result;
}

function canonicalDay(hours: DayHours): string {
  if (!hours) return "Closed";
  const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${clock(hours.open)} - ${clock(hours.close)}`;
}

export function canonicalizeBusinessHours(value: unknown): CanonicalBusinessHours | null {
  const parsed = parseBusinessHours(value);
  if (!parsed) return null;
  return Object.fromEntries(WEEKDAYS.map((day) => [day, canonicalDay(parsed[day])])) as CanonicalBusinessHours;
}

export function validateBusinessHours(value: unknown): BusinessHoursValidation {
  if (typeof value === "string") {
    const hours = canonicalizeBusinessHours(value);
    return hours ? { valid: true, errors: {}, hours } : { valid: false, errors: { _root: "Use a clear range such as Mon-Fri 8-5." } };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: { _root: "Business hours are required." } };
  }
  const source = value as Record<string, unknown>;
  const errors: BusinessHoursValidation["errors"] = {};
  const parsed = emptyWeek();
  for (const day of WEEKDAYS) {
    const raw = source[day] ?? source[day.toLowerCase()] ?? source[day.slice(0, 3)] ?? source[day.slice(0, 3).toLowerCase()];
    const result = parseDayHours(raw);
    if (result === undefined) errors[day] = raw === undefined ? "Choose hours or mark this day Closed." : "Enter a valid opening and closing time.";
    else parsed[day] = result;
  }
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    errors: {},
    hours: Object.fromEntries(WEEKDAYS.map((day) => [day, canonicalDay(parsed[day])])) as CanonicalBusinessHours,
  };
}

export function zonedParts(timestamp: number, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "long",
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value;
  const weekday = part("weekday");
  if (!weekday || !WEEKDAYS.includes(weekday as Weekday)) throw new RangeError(`Unsupported weekday for ${timeZone}`);
  return {
    year: Number(part("year")), month: Number(part("month")), day: Number(part("day")),
    hour: Number(part("hour")), minute: Number(part("minute")), second: Number(part("second")), weekday: weekday as Weekday,
  };
}

export function zonedDateTimeToUtc(
  input: Omit<ZonedParts, "second" | "weekday"> & { second?: number },
  timeZone: string
): number | null {
  const targetAsUtc = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second ?? 0);
  let guess = targetAsUtc;
  try {
    for (let iteration = 0; iteration < 4; iteration++) {
      const actual = zonedParts(guess, timeZone);
      const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
      const adjustment = targetAsUtc - actualAsUtc;
      guess += adjustment;
      if (adjustment === 0) break;
    }
    const roundTrip = zonedParts(guess, timeZone);
    return roundTrip.year === input.year && roundTrip.month === input.month && roundTrip.day === input.day && roundTrip.hour === input.hour && roundTrip.minute === input.minute
      ? guess
      : null;
  } catch {
    return null;
  }
}

export function dayWindow(date: Date | number, timeZone: string, businessHours: unknown): { startTime: number; endTime: number } | null {
  const parsed = parseBusinessHours(businessHours);
  if (!parsed) return null;
  try {
    const local = zonedParts(typeof date === "number" ? date : date.getTime(), timeZone);
    const hours = parsed[local.weekday];
    if (!hours) return null;
    const startTime = zonedDateTimeToUtc({ year: local.year, month: local.month, day: local.day, hour: Math.floor(hours.open / 60), minute: hours.open % 60 }, timeZone);
    const endTime = zonedDateTimeToUtc({ year: local.year, month: local.month, day: local.day, hour: Math.floor(hours.close / 60), minute: hours.close % 60 }, timeZone);
    return startTime === null || endTime === null ? null : { startTime, endTime };
  } catch {
    return null;
  }
}

export function isOpenAt(timestamp: Date | number, timeZone: string, businessHours: unknown): boolean {
  const millis = typeof timestamp === "number" ? timestamp : timestamp.getTime();
  const window = dayWindow(millis, timeZone, businessHours);
  return window !== null && millis >= window.startTime && millis < window.endTime;
}

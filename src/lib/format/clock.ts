// Small helpers for the free-text clock times the field parser produces ("08:00", "8:00 AM", "4 PM", "16:00").

/** Minutes after midnight, or null when the text is not a recognisable clock time. */
export function parseClock(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?\s*$/i.exec(text.trim());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();
  if (minute > 59 || hour > 24) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "p" && hour < 12) hour += 12;
    if (meridiem === "a" && hour === 12) hour = 0;
  }
  return (hour % 24) * 60 + minute;
}

/** "8:00 AM" style, matching how the rest of the app shows times. */
export function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const meridiem = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${meridiem}`;
}

/** Normalises a clock string to "8:00 AM"; leaves anything unrecognisable exactly as it was. */
export function tidyClock(text: string | undefined): string | undefined {
  const minutes = parseClock(text);
  return minutes === null ? text : formatClock(minutes);
}

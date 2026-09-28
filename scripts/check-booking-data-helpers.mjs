export function timestampMillis(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
}

export function formatLocalTime(value, timeZone) {
  const millis = timestampMillis(value);
  if (millis === null) return "invalid time";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(millis));
}

export function formatScheduleRow(entry, timeZone) {
  const label = entry.label || entry.id || "unknown";
  return `${entry.kind} ${label} | ${formatLocalTime(entry.startTime, timeZone)} | status=${entry.status || "unknown"} | source=${entry.source || "unknown"}`;
}

export function sortScheduleRows(entries) {
  return [...entries].sort((left, right) =>
    (timestampMillis(left.startTime) ?? Number.MAX_SAFE_INTEGER) -
    (timestampMillis(right.startTime) ?? Number.MAX_SAFE_INTEGER)
  );
}

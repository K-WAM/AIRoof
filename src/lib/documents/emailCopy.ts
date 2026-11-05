const plain = (value: string) => value.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
const shorten = (value: string, max: number) => value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;

/** Plain header text: reserve space for the immutable document number, shortening the title first. */
export function documentEmailSubject(kind: "quote" | "invoice" | "report" | "receipt", business: string, title = "", number = "", due = ""): string {
  const name = shorten(plain(business), 42), job = plain(title), id = plain(number);
  if (kind === "quote") {
    const base = `Your quote from ${name}`, suffix = ` (${id})`;
    const room = 90 - base.length - suffix.length - 3;
    return `${base}${job && room > 0 ? ` — ${shorten(job, room)}` : ""}${suffix}`;
  }
  if (kind === "invoice") {
    const suffix = ` — ${id}${due ? `, due ${plain(due)}` : ""}`;
    return `Your invoice from ${shorten(name, Math.max(1, 90 - 18 - suffix.length))}${suffix}`;
  }
  if (kind === "receipt") {
    const suffix = ` — ${id}`;
    return `Payment received by ${shorten(name, Math.max(1, 90 - 20 - suffix.length))}${suffix}`;
  }
  const suffix = ` report from ${name}`;
  return `Your ${shorten(job || "service", 90 - 5 - suffix.length)}${suffix}`;
}

export function documentPreheader(business: string, message: string): string { return `${plain(business)} · ${plain(message)}`; }

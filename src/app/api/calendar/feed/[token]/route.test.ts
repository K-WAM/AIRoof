import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";
import { hashFeedToken } from "@/lib/calendar/feedToken";
import { buildInspectorFeed, escapeText, foldLine, shortName } from "@/lib/calendar/ics";

let db: FakeDb;
let gateUser: { uid: string; role: string; crewId?: string } | null = { uid: "insp", role: "crew", crewId: "c1" };
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: async () => (gateUser ? { user: gateUser } : { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }),
}));

import { GET } from "./route";
import { DELETE, POST } from "@/app/api/company/team/me/calendar-feed/route";

const HOUR = 60 * 60 * 1000;
const feed = (token: string) => GET(new NextRequest(`http://localhost/api/calendar/feed/${token}`), { params: Promise.resolve({ token }) });
const issue = async () => (await (await POST(new NextRequest("http://localhost/api/company/team/me/calendar-feed", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ businessId: "biz" }),
}))).json()) as { url: string; webcal: string };
const tokenOf = (url: string) => url.split("/").pop()!;

beforeEach(() => {
  db = makeFakeDb();
  gateUser = { uid: "insp", role: "crew", crewId: "c1" };
  const soon = Date.now() + 2 * HOUR;
  db.__seed("businesses", "biz", { businessName: "Apex Roofing" });
  db.__seed("businesses/biz/crews", "c1", { name: "Dominic", kind: "inspector", active: true });
  db.__seed("businessUsers", "insp", { businessId: "biz", role: "crew", crewId: "c1", active: true, email: "dom@apex.test" });
  db.__seed("businesses/biz/appointments", "a1", { startTime: soon, endTime: soon + HOUR, callerName: "Carla Esnaida", callerPhone: "+19548829586",
    address: "22572 Long York St, Boca Raton, FL 33428", serviceType: "Roof inspection", notes: "Access: gate code 1010\nURGENT: leak", assignedCrewId: "c1", pendingConfirmation: true });
  db.__seed("businesses/biz/appointments", "a2", { startTime: soon, callerName: "Someone Else", assignedCrewId: "c2" });
  db.__seed("businesses/biz/appointments", "a3", { startTime: soon, callerName: "Cancelled Person", assignedCrewId: "c1", status: "cancelled" });
  db.__seed("businesses/biz/timeBlocks", "b1", { blockId: "b1", crewId: "c1", startTime: soon + 3 * HOUR, endTime: soon + 4 * HOUR, label: "Materials pickup" });
});

describe("phone-calendar feed (T-153 B5)", () => {
  it("serves the member's own bookings and blocks — time, short name, address — and nothing behind the login", async () => {
    const { url, webcal } = await issue();
    expect(webcal.startsWith("webcal://")).toBe(true);
    const response = await feed(tokenOf(url));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const raw = await response.text();
    expect(raw.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
    const text = raw.replace(/\r\n /g, "");
    expect(text).toContain("UID:a1@luxor");
    expect(text).toContain("SUMMARY:Roof inspection — Carla E.");
    expect(text).toContain("LOCATION:22572 Long York St\\, Boca Raton\\, FL 33428");
    expect(text).toContain("STATUS:TENTATIVE");
    expect(text).toContain("SUMMARY:Blocked — Materials pickup");
    // Never in a bearer link: phone, gate code, urgent notes, other rows, cancelled bookings, the full surname.
    for (const secret of ["9548829586", "1010", "URGENT", "Someone Else", "Cancelled Person", "Esnaida"]) expect(text).not.toContain(secret);  });

  it("stores only the hash, and a new link replaces the old one", async () => {
    const first = tokenOf((await issue()).url);
    expect(db.__peek("businessUsers", "insp")?.calendarFeedTokenHash).toBe(hashFeedToken(first.replace(/\.ics$/, "")));
    expect(JSON.stringify(db.__peek("businessUsers", "insp"))).not.toContain(first.replace(/\.ics$/, ""));
    const second = tokenOf((await issue()).url);
    expect((await feed(first)).status).toBe(404);
    expect((await feed(second)).status).toBe(200);
  });

  it("404s for an unknown or malformed token, a disabled member, and after the link is turned off", async () => {
    expect((await feed("x".repeat(43))).status).toBe(404);
    expect((await feed("not-a-token")).status).toBe(404);
    const token = tokenOf((await issue()).url);
    db.__seed("businessUsers", "insp", { ...db.__peek("businessUsers", "insp"), active: false });
    expect((await feed(token)).status).toBe(404);
    db.__seed("businessUsers", "insp", { ...db.__peek("businessUsers", "insp"), active: true });
    expect((await feed(token)).status).toBe(200);
    await DELETE(new NextRequest("http://localhost/api/company/team/me/calendar-feed?businessId=biz", { method: "DELETE" }));
    expect((await feed(token)).status).toBe(404);
  });

  it("won't issue a link to someone with no schedule row", async () => {
    gateUser = { uid: "office", role: "staff" };
    const response = await POST(new NextRequest("http://localhost/api/company/team/me/calendar-feed", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ businessId: "biz" }),
    }));
    expect(response.status).toBe(409);
  });
});

describe("ics helpers", () => {
  it("escapes text and shortens names", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    expect(shortName("Carla Esnaida")).toBe("Carla E.");
    expect(shortName("Cher")).toBe("Cher");
    expect(shortName("")).toBe("Customer");
  });

  it("folds long lines at 75 octets without splitting a character", () => {
    const folded = foldLine(`SUMMARY:${"é".repeat(60)}`);
    for (const line of folded.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"é".repeat(60)}`);
  });

  it("ends every line with CRLF", () => {
    const text = buildInspectorFeed({ calendarName: "X", bookings: [], blocks: [], fieldUrl: "https://x/company/field", now: 0 });
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });
});

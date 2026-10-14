import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import { createTrial, readTrial, startTrialCall, trialFieldGrant, TRIAL_COOKIE, TRIAL_TTL_MS, validTrialDetails, type RoofingTrial } from "@/lib/demo/roofingTrial";

export const maxDuration = 30;
function noStore(response: NextResponse) { response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer"); return response; }
async function sessionResponse(trial: RoofingTrial) {
  const token = await getAdminAuth()!.createCustomToken(trial.uid);
  return noStore(NextResponse.json({ token, name: trial.name, companyName: trial.companyName, businessId: trial.businessId,
    expiresAt: trial.expiresAt, callsLeft: Math.max(0, 2 - trial.calls), notesLeft: Math.max(0, 3 - trial.notes) }));
}
export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, { windowMs: 60_000, max: 20, keyPrefix: "roofing-trial-status" });
  if (limited) return noStore(limited);
  const trial = await readTrial(request);
  return trial ? sessionResponse(trial) : noStore(NextResponse.json({ trial: null }));
}
export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, { windowMs: 60_000, max: 12, keyPrefix: "roofing-trial-action" });
  if (limited) return noStore(limited);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return noStore(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  if (!request.headers.get("content-type")?.includes("application/json") || Number(request.headers.get("content-length") || 0) > 2048) {
    return noStore(NextResponse.json({ error: "Invalid request" }, { status: 400 }));
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || JSON.stringify(body).length > 2048) return noStore(NextResponse.json({ error: "Invalid request" }, { status: 400 }));
  try {
    const trial = await readTrial(request);
    if (body.action === "call" || body.action === "field") {
      if (Object.keys(body).some((key) => key !== "action")) return noStore(NextResponse.json({ error: "Invalid request" }, { status: 400 }));
      if (!trial) return noStore(NextResponse.json({ error: "Start your private demo first, or start again if it expired." }, { status: 401 }));
      return noStore(body.action === "call" ? await startTrialCall(trial) : await trialFieldGrant(trial));
    }
    if (body.action !== "create" || Object.keys(body).some((key) => !["action", "name", "companyName", "email"].includes(key))) return noStore(NextResponse.json({ error: "Invalid request" }, { status: 400 }));
    const details = validTrialDetails(body);
    if (!details) return noStore(NextResponse.json({ error: "Enter your name, business name and a valid optional email." }, { status: 400 }));
    if (trial) return sessionResponse(trial);
    const created = await createTrial(request, details);
    if (!created) return noStore(NextResponse.json({ error: "Today's demo limit has been reached. Contact connect@luxordev.com for a guided demo." }, { status: 429 }));
    const response = await sessionResponse(created.trial);
    response.cookies.set(TRIAL_COOKIE, created.cookie, { httpOnly: true, sameSite: "strict", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: TRIAL_TTL_MS / 1000 });
    return response;
  } catch {
    return noStore(NextResponse.json({ error: "Could not open your demo. Please try again." }, { status: 503 }));
  }
}

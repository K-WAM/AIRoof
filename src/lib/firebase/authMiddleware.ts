import { getAdminAuth, getAdminFirestore } from "./admin";

export interface VerifiedUser {
  uid: string;
  email: string;
  businessId?: string;
  role: "superadmin" | "owner" | "staff" | "viewer";
  superadmin?: boolean;
}

function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function forbidden(): Response {
  return new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

export async function verifyUser(request: Request): Promise<VerifiedUser | null> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;

  const auth = getAdminAuth();
  if (!auth) return null;

  try {
    const decoded = await auth.verifyIdToken(token);
    const db = getAdminFirestore();
    if (!db) return null;

    const userDoc = await db.collection("businessUsers").doc(decoded.uid).get();
    if (!userDoc.exists) return null;

    return userDoc.data() as VerifiedUser;
  } catch {
    return null;
  }
}

export async function requireAuth(request: Request): Promise<VerifiedUser> {
  const user = await verifyUser(request);
  if (!user) throw unauthorized("Unauthorized");
  return user;
}

export async function requireSuperadmin(request: Request): Promise<VerifiedUser> {
  const user = await verifyUser(request);
  if (!user) throw unauthorized("Unauthorized");
  if (!user.superadmin && user.role !== "superadmin") throw forbidden();
  return user;
}

export async function requireBusinessMember(
  request: Request,
  businessId: string
): Promise<VerifiedUser> {
  const user = await verifyUser(request);
  if (!user) throw unauthorized("Unauthorized");
  if (!user.superadmin && user.businessId !== businessId) throw forbidden();
  return user;
}

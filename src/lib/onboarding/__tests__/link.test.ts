import { beforeEach, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { portalDefaults } from "../defaults";
import { hashToken, lookupLink, newToken, claimWrite } from "../link";
import { changeLink } from "../admin";
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => state.db }));
let fake: ReturnType<typeof makeFakeDb>;
beforeEach(() => { fake = makeFakeDb(); state.db = fake; fake.__seed("clientOnboarding", "a", { ...portalDefaults("a", "Example") }); });
it("rejects unknown and malformed tokens", async () => {
  await expect(lookupLink("bad")).rejects.toMatchObject({ status: 401 });
  await expect(lookupLink(newToken())).rejects.toMatchObject({ status: 401 });
});
it("looks up the hash, expires and immediately revokes old cookies", async () => {
  const actor = { uid: "admin", email: "admin@example.test" };
  const portal = await changeLink("a", actor, false); const token = portal.link!.token;
  expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
  expect(fake.__list("clientOnboardingLinks")[0].id).toBe(hashToken(token));
  expect((await lookupLink(token)).record.businessId).toBe("a");
  const next = await changeLink("a", actor, false);
  await expect(lookupLink(token)).rejects.toMatchObject({ status: 401 });
  await changeLink("a", actor, true);
  await expect(lookupLink(next.link!.token)).rejects.toMatchObject({ status: 401 });
  expect(fake.__list("adminAuditEvents")).toHaveLength(3);
});
it("rejects expired records and mismatched portal tokens", async () => {
  const portal = await changeLink("a", { uid: "admin" }, false); const token = portal.link!.token;
  await fake.collection("clientOnboardingLinks").doc(hashToken(token)).update({ expiresAt: Date.now() - 1 });
  await expect(lookupLink(token)).rejects.toMatchObject({ status: 401 });
  await fake.collection("clientOnboardingLinks").doc(hashToken(token)).update({ expiresAt: Date.now() + 100000 });
  await fake.collection("clientOnboarding").doc("a").update({ link: { ...portal.link, token: newToken() } });
  await expect(lookupLink(token)).rejects.toMatchObject({ status: 401 });
});
it("shares a persisted 20 writes per minute budget", async () => {
  const portal = await changeLink("a", { uid: "admin" }, false); const hash = hashToken(portal.link!.token);
  for (let i = 0; i < 20; i++) await claimWrite(hash);
  await expect(claimWrite(hash)).rejects.toMatchObject({ status: 429 });
  await fake.collection("clientOnboardingLinks").doc(hash).update({ writeWindowAt: Date.now() - 61000 });
  await expect(claimWrite(hash)).resolves.toBeUndefined();
});

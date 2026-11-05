import { expect, it } from "vitest";
import { resolveLetterhead } from "./letterhead";
import { validLogoSelection } from "./logoSelection";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import type { LibraryLogo } from "@/types/library";
const logos = [{ logoId: "a", b64: "AAA", mimeType: "image/png", variant: "color", isDefault: true }, { logoId: "b", b64: "BBB", mimeType: "image/png", variant: "mono-dark" }] as LibraryLogo[];
it("validates only tenant-owned logo ids and preserves the legacy default", async () => {
  const db = makeFakeDb(); db.__seed("businesses/b/library", "logos", { logos });
  expect(await validLogoSelection(db as unknown as FirebaseFirestore.Firestore, "other", "b")).toBe(false);
  expect(await validLogoSelection(db as unknown as FirebaseFirestore.Firestore, "b", "b")).toBe(true);
  expect(await validLogoSelection(db as unknown as FirebaseFirestore.Firestore, "b", null)).toBe(true);
  expect(resolveLetterhead({}, logos).logoUrl).toContain("AAA");
  expect(resolveLetterhead({}, logos, "light", "b").logoUrl).toContain("BBB");
  expect(resolveLetterhead({ logoUrl: "business.png" }, logos, "light", null).logoUrl).toBe("business.png");
});

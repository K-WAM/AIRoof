import { it, expect, vi } from "vitest";
import { deliverDocument, parseDocumentRecipients } from "./recipients";
it("rejects 6 addresses and names invalid or empty addresses", () => {
  expect(parseDocumentRecipients(Array.from({ length: 6 }, (_, i) => `p${i}@example.test`))).toEqual({ error: "Use at most 5 recipient email addresses." });
  expect(parseDocumentRecipients(["ok@example.test", "bad-address"])).toEqual({ error: "Invalid email address: bad-address" });
  expect(parseDocumentRecipients("ok@example.test,")).toEqual({ error: "Invalid email address: (empty)" });
});
it("accepts legacy strings and comma-separated lists, normalizing duplicates", () => {
  expect(parseDocumentRecipients("A@Example.test")).toEqual({ recipients: ["a@example.test"] });
  expect(parseDocumentRecipients("a@example.test, b@example.test, A@example.test")).toEqual({ recipients: ["a@example.test", "b@example.test"] });
});
it("calls the sender separately for every recipient and reports partial failures", async () => {
  const sender = vi.fn().mockResolvedValueOnce({ status: "delivered" }).mockRejectedValueOnce(new Error("provider"));
  expect(await deliverDocument(["a@example.test", "b@example.test"], sender)).toEqual({ delivered: ["a@example.test"], failed: ["b@example.test"] });
  expect(sender.mock.calls).toEqual([["a@example.test"], ["b@example.test"]]);
});

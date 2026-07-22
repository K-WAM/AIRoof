import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { appendAuditEvent } from "@/lib/audit";

describe("append-only audit events", () => {
  it("uses transaction.create and rejects an event ID overwrite", async () => {
    const stored = new Set<string>();
    const create = vi.fn((ref: { path: string }) => {
      if (stored.has(ref.path)) throw new Error("already exists");
      stored.add(ref.path);
    });
    const db = {
      collection: (root: string) => ({
        doc: (businessId: string) => ({
          collection: (name: string) => ({
            doc: (eventId: string) => ({ path: `${root}/${businessId}/${name}/${eventId}` }),
          }),
        }),
      }),
      runTransaction: async <T>(callback: (transaction: { create: typeof create }) => Promise<T>) =>
        callback({ create }),
    } as unknown as Firestore;

    const input = {
      eventId: "fixed-event",
      businessId: "biz_a",
      correlationId: "call_1",
      action: "appointment.lookup" as const,
      actor: { type: "provider" as const, id: "vapi" },
      subject: { type: "call" as const, id: "call_1" },
      providerIds: { vapiCallId: "provider_call_1" },
      result: "success" as const,
      details: { outcomeCode: "completed" },
    };

    const event = await appendAuditEvent(db, input);
    expect(Object.isFrozen(event)).toBe(true);
    expect(create).toHaveBeenCalledOnce();
    await expect(appendAuditEvent(db, input)).rejects.toThrow("already exists");
  });
});

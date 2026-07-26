import { describe, expect, it, vi } from "vitest";

import { postFieldAudioWithRetry } from "@/hooks/useFieldAudio";

const request = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ audioBase64: "same-recorded-blob" }),
};

describe("postFieldAudioWithRetry", () => {
  it("re-posts the same recorded payload once after a transient failure", async () => {
    const success = new Response(JSON.stringify({ success: true }), { status: 200 });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network interrupted"))
      .mockResolvedValueOnce(success);

    await expect(
      postFieldAudioWithRetry("/api/jobs/J-1/field-audio", request, fetchImpl),
    ).resolves.toBe(success);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]).toEqual(fetchImpl.mock.calls[1]);
  });

  it("surfaces the second failure after exactly one automatic retry", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network interrupted"))
      .mockRejectedValueOnce(new TypeError("network still unavailable"));

    await expect(
      postFieldAudioWithRetry("/api/jobs/J-1/field-audio", request, fetchImpl),
    ).rejects.toThrow("network still unavailable");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]).toEqual(fetchImpl.mock.calls[1]);
  });

  it("retries one non-success HTTP response before returning the final response", async () => {
    const unavailable = new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 });
    const success = new Response(JSON.stringify({ success: true }), { status: 200 });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(unavailable)
      .mockResolvedValueOnce(success);

    await expect(
      postFieldAudioWithRetry("/api/jobs/J-1/field-audio", request, fetchImpl),
    ).resolves.toBe(success);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

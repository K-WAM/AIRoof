// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFieldAudio } from "../useFieldAudio";

const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/offline/outbox", () => ({ fieldPost: mocks.post }));
vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); mocks.post.mockReset(); });

describe("recording retention when phone storage fails", () => {
  it("keeps the original audio and job for an explicit retry instead of overwriting it", async () => {
    class Recorder {
      static isTypeSupported() { return true; }
      state = "inactive";
      onstop?: () => void;
      ondataavailable?: (event: { data: Blob }) => void;
      constructor(public stream: MediaStream) {}
      start() { this.state = "recording"; }
      stop() {
        this.ondataavailable?.({ data: new Blob(["a".repeat(700)], { type: "audio/webm" }) });
        this.state = "inactive"; this.onstop?.();
      }
    }
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }));
    vi.stubGlobal("MediaRecorder", Recorder); vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    mocks.post.mockRejectedValueOnce(new Error("This phone could not save your entry"))
      .mockResolvedValueOnce(Response.json({ queued: true }, { status: 202 }));
    const options = { businessId: "biz", submittedBy: "Carlos" };
    const { result, rerender } = renderHook(({ jobId }) => useFieldAudio(jobId, options), { initialProps: { jobId: "J-1" } });
    await act(async () => { await result.current.startRecording(); });
    await act(async () => { await result.current.stopRecording(); });
    expect(result.current.unsavedRecordingJobId).toBe("J-1");
    expect(result.current.errorMessage).toContain("could not save");
    rerender({ jobId: "J-2" });
    await act(async () => { await result.current.startRecording(); });
    expect(getUserMedia).toHaveBeenCalledOnce();
    await act(async () => { await result.current.retryRecording(); });
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(mocks.post.mock.calls[0][0]).toBe("/api/jobs/J-1/field-audio");
    expect(mocks.post.mock.calls[1][0]).toBe("/api/jobs/J-1/field-audio");
    expect(mocks.post.mock.calls[1][1].body).toBe(mocks.post.mock.calls[0][1].body);
    expect(mocks.post.mock.calls[1][2].size).toBe(700);
    expect(result.current.unsavedRecordingJobId).toBeUndefined();
  });
});

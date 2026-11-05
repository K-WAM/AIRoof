// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const audio = vi.hoisted(() => ({ startRecording: vi.fn(async () => {}), stopRecording: vi.fn(async () => {}) }));
vi.mock("@/hooks/useFieldAudio", () => ({ useFieldAudio: () => ({ status: null, ...audio }) }));
import { FieldNoteComposer } from "./FieldNoteComposer";
beforeEach(() => { vi.useFakeTimers(); audio.startRecording.mockClear(); audio.stopRecording.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
function show() { render(<FieldNoteComposer businessId="business" job={{ jobId: "J-1" }} authorName="Worker" />); return screen.getByTestId("note-mic"); }
it("a quick press gives guidance and does not start recording", () => {
  const button = show(); button.setPointerCapture = vi.fn();
  fireEvent.pointerDown(button, { pointerId: 1 }); fireEvent.pointerUp(button, { pointerId: 1 });
  expect(screen.getByText("Keep holding while you talk, then let go to send")).toBeInTheDocument();
  expect(audio.startRecording).not.toHaveBeenCalled(); expect(audio.stopRecording).not.toHaveBeenCalled();
});
it("a keyboard hold starts and releases the recording", async () => {
  const button = show(); fireEvent.keyDown(button, { key: " " });
  await act(async () => { vi.advanceTimersByTime(600); });
  expect(audio.startRecording).toHaveBeenCalledOnce();
  fireEvent.keyUp(button, { key: " " }); await act(async () => {});
  expect(audio.stopRecording).toHaveBeenCalledOnce();
});

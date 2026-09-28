// Work a caller should not wait for (the booking-time text, the inspector's email) runs after the tool's reply is sent.
// Inside a request, Next's after() keeps the function alive until it finishes (Vercel waitUntil). Outside one — unit
// tests, scripts — after() throws, so the work runs now and the returned promise lets the caller await it.

import { after } from "next/server";

export function runAfterResponse(label: string, task: () => Promise<unknown>): Promise<void> | undefined {
  const guarded = async () => {
    try {
      await task();
    } catch (error) {
      console.error(`${label} failed after the response:`, error);
    }
  };
  try {
    after(guarded);
    return undefined;
  } catch {
    return guarded();
  }
}

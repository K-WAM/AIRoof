import type { Instrumentation } from "next";
import { after } from "next/server";
import { captureServerError, serverErrorsEnabled } from "@/lib/analytics/serverErrors";

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  try {
    if (!serverErrorsEnabled()) return;
    const send = () => captureServerError(error, { method: request.method }, {
      routePath: context.routePath, routeType: context.routeType,
    });
    // after extends the serverless lifetime where Next provides a request scope/waitUntil.
    try { after(send); } catch { void send(); }
  } catch { /* Instrumentation must never affect the response. */ }
};

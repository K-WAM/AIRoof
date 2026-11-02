import posthog from "posthog-js";
import { analyticsContext, anonymousPage, bindAnalytics, eligibleClient, subscribeAnalytics } from "./client";
import { beforeSend, replayAllowed, REPLAY_SAMPLE } from "./filter";
import { trackedPage } from "./pageView";

let initialized = false;
let identity = "";
let lastView = "";
let replayIdle = false;
let keepReplaySession = "";

function idle(callback: () => void) {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(callback, 1000);
  return () => clearTimeout(id);
}

export function startAnalytics() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!token || host !== "https://us.i.posthog.com" || window.location.hostname !== "crm.luxordev.com") return () => {};
  let cancelled = false;
  const safe = (run: () => void) => { try { run(); } catch { /* analytics never interrupts work */ } };
  const record = () => {
    if (cancelled || !replayIdle || !eligibleClient() || !replayAllowed(window.location.pathname)) return;
    safe(() => posthog.startSessionRecording(keepReplaySession === posthog.get_session_id() ? { sampling: true, linked_flag: true, url_trigger: true, event_trigger: true } : undefined));
  };
  const sync = () => safe(() => {
    const { user, business } = analyticsContext();
    const client = eligibleClient();
    const page = trackedPage(window.location.pathname);
    const anonymous = anonymousPage(window.location.pathname);
    if (!page || (!client && !anonymous)) {
      bindAnalytics(null);
      if (initialized) { posthog.stopSessionRecording(); if (identity) posthog.reset(); }
      identity = ""; lastView = ""; keepReplaySession = "";
      return;
    }
    if (!initialized) {
      posthog.init(token, {
        api_host: host, ui_host: "https://us.posthog.com", defaults: "2026-05-30",
        autocapture: false, capture_pageview: false, capture_pageleave: false,
        capture_exceptions: true, capture_dead_clicks: true, rageclick: false,
        disable_session_recording: true, disable_surveys: true, disable_product_tours: true,
        advanced_disable_flags: true, save_referrer: false, person_profiles: "identified_only",
        mask_all_text: true, mask_all_element_attributes: true,
        enable_recording_console_log: false, capture_performance: false,
        session_recording: {
          maskAllInputs: true, maskTextSelector: "*", maskAllElementAttributes: true,
          blockSelector: "img, video, audio, canvas, input[type=hidden], input[type=file]",
          captureCanvas: { recordCanvas: false }, recordBody: false, recordHeaders: false,
          captureJsonLd: false, collectFonts: false,
          maskCapturedNetworkRequestFn: () => null,
          sampleRate: REPLAY_SAMPLE,
        },
        before_send: (event) => {
          const filtered = beforeSend(event);
          if (filtered && ["$exception", "$rageclick"].includes(filtered.event)) { keepReplaySession = posthog.get_session_id(); record(); }
          return filtered;
        },
      });
      initialized = true;
    }
    const nextIdentity = client ? `${user!.uid}:${business!.businessId}` : "";
    if (identity !== nextIdentity) {
      posthog.stopSessionRecording(); posthog.reset(); lastView = ""; keepReplaySession = "";
      identity = nextIdentity;
      if (client) posthog.identify(user!.uid); // no email/name; $identify is filtered, subsequent events carry uid
    }
    if (client) {
      posthog.register({ app: "crm", business_id: business!.businessId, industry: business!.industry, role: user!.role });
      bindAnalytics((event, props) => posthog.capture(event, props));
    } else {
      bindAnalytics(null);
      posthog.unregister("business_id"); posthog.unregister("industry"); posthog.unregister("role");
    }
    const view = `${identity}:${window.location.pathname}`;
    if (lastView !== view) { posthog.capture("$pageview", { page }); lastView = view; }
    if (client && replayAllowed(window.location.pathname)) record();
    else posthog.stopSessionRecording();
  });
  // Rage detection without SDK autocapture: three nearby clicks in a second; no element text/attributes.
  const clicks: Array<{ x: number; y: number; at: number }> = [];
  const click = (event: MouseEvent) => safe(() => {
    if (!eligibleClient()) return;
    const now = Date.now();
    while (clicks.length && now - clicks[0].at > 1000) clicks.shift();
    clicks.push({ x: event.clientX, y: event.clientY, at: now });
    if (clicks.length >= 3 && clicks.every((point) => Math.abs(point.x - event.clientX) < 30 && Math.abs(point.y - event.clientY) < 30)) {
      posthog.capture("$rageclick"); clicks.length = 0;
    }
  });
  const unsubscribe = subscribeAnalytics(sync);
  document.addEventListener("click", click, { passive: true });
  sync();
  const cancelIdle = idle(() => { replayIdle = true; record(); });
  return () => {
    cancelled = true; replayIdle = false; cancelIdle(); unsubscribe();
    document.removeEventListener("click", click); bindAnalytics(null);
    safe(() => { if (initialized) posthog.stopSessionRecording(); });
  };
}

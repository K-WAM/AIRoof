"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackedPage } from "@/lib/analytics/pageView";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
let initialized = false;

export function PostHogPageViews() {
  const pathname = usePathname();
  const lastPage = useRef<string | null>(null);

  useEffect(() => {
    // Production only. Local development, previews, and demo test runs never send events.
    if (!token || host !== "https://us.i.posthog.com" || window.location.hostname !== "crm.luxordev.com") return;
    const page = trackedPage(pathname ?? "");
    if (!page || page === lastPage.current) return;

    let cancelled = false;
    void import("posthog-js").then(({ default: posthog }) => {
      if (cancelled) return;
      try {
        if (!initialized) {
          posthog.init(token, {
            api_host: host,
            defaults: "2026-05-30",
            autocapture: false,
            capture_pageview: false,
            capture_pageleave: false,
            disable_session_recording: true,
            disable_surveys: true,
            disable_product_tours: true,
            advanced_disable_flags: true,
            save_referrer: false,
            person_profiles: "identified_only",
            before_send: (event) => {
              if (event.event !== "$pageview") return null;
              const route = event.properties.page;
              if (typeof route !== "string" || trackedPage(route) !== route) return null;
              return {
                ...event,
                properties: {
                  page: route,
                  $current_url: `https://crm.luxordev.com${route}`,
                  $pathname: route,
                  $host: "crm.luxordev.com",
                  $session_id: event.properties.$session_id,
                },
              };
            },
          });
          initialized = true;
        }
        posthog.capture("$pageview", { page });
        lastPage.current = page;
      } catch {
        // Analytics must never interrupt the app.
      }
    }).catch(() => {
      // A blocked SDK chunk also leaves the app usable.
    });

    return () => { cancelled = true; };
  }, [pathname]);

  return null;
}

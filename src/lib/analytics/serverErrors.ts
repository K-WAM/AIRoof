import { isE2EHarness } from "@/lib/e2e/harness";

type Request = { method: string };
type Context = { routePath?: string; routeType?: string };
const TIMEOUT = 2000;

// Only source locations, never error text, causes, locals, or the request URL.
export function scrubServerError(error: unknown, request: Request, context: Context) {
  const source = error instanceof Error ? error : undefined;
  const type = source && /^[A-Za-z_$][\w$]{0,79}$/.test(source.name) ? source.name : "Error";
  const frames = (source?.stack ?? "").split("\n").slice(1, 51).flatMap((line) => {
    const match = /^\s*at (?:([^()]+) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (!match) return [];
    // Drop machine/user prefixes and URL credentials; retain only deployed source paths.
    const location = match[2].split(/[?#]/, 1)[0].replace(/\\/g, "/");
    const file = /(?:^|\/)((?:\.next\/server|src|node_modules)\/[\w./[\]@()-]+\.(?:[cm]?js|tsx?))$/.exec(location)?.[1];
    if (!file) return [];
    return [{ filename: file, lineno: Number(match[3]), colno: Number(match[4]),
      function: match[1] && /^[\w$.[\]<>]+$/.test(match[1]) ? match[1] : undefined }];
  }).reverse(); // PostHog frames are oldest first.
  // routePath is Next's template, not request.path (which can contain customer/secret values).
  const routePath = context.routePath?.split(/[?#]/, 1)[0];
  return {
    $exception_list: [{ type, value: "[masked]", stacktrace: { frames } }],
    routePath: routePath?.startsWith("/") ? routePath : "[unknown]",
    method: /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)$/.test(request.method) ? request.method : "[unknown]",
    routeType: ["render", "route", "action", "middleware"].includes(context.routeType ?? "") ? context.routeType : "[unknown]",
    $host: "crm.luxordev.com", app: "crm", runtime: "server", $process_person_profile: false,
  };
}

export function createErrorLimiter() {
  let captures: number[] = [];
  const recent = new Map<string, number>();
  return (type: string, routePath: string, now = Date.now()) => {
    captures = captures.filter((at) => now - at < 3_600_000);
    for (const [key, at] of recent) if (now - at >= 60_000) recent.delete(key);
    const key = JSON.stringify([type, routePath]);
    // PostHog free tier: 100k exceptions/month. Bound storms and distinct errors per instance.
    if (recent.has(key) || captures.length >= 200) return false;
    recent.set(key, now); captures.push(now);
    return true;
  };
}
const allowCapture = createErrorLimiter();

export function serverErrorsEnabled() {
  return process.env.VERCEL_ENV === "production" && process.env.NODE_ENV === "production" &&
    !!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && !isE2EHarness();
}

export async function captureServerError(error: unknown, request: Request, context: Context): Promise<void> {
  try {
    if (!serverErrorsEnabled()) return;
    const properties = scrubServerError(error, request, context);
    if (!allowCapture(properties.$exception_list[0].type, properties.routePath)) return;
    const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          const { PostHog } = await import("posthog-node");
          if (controller.signal.aborted) return;
          const client = new PostHog(token, {
            host: process.env.NEXT_PUBLIC_POSTHOG_HOST, flushAt: 1, flushInterval: 0,
            requestTimeout: TIMEOUT, fetchRetryCount: 0, disableGeoip: true, disableRemoteConfig: true,
            fetch: (url, options) => fetch(url, { ...options, signal: controller.signal }),
          });
          try {
            // Give the SDK a fresh, masked error so it adds required exception metadata
            // without ever seeing the original message, causes or request. Our safe list overrides its frames.
            const masked = new Error("[masked]");
            masked.stack = "";
            client.captureException(masked, "server", { ...properties, token });
          } finally {
            await client.shutdown(TIMEOUT);
          }
        })(),
        new Promise<void>((resolve) => { timer = setTimeout(() => { controller.abort(); resolve(); }, TIMEOUT); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch { /* Monitoring must never break the failing request, even on malformed errors or SDK failures. */ }
}

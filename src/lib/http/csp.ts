// The ONE Content-Security-Policy builder. next.config.ts uses it (no nonce) for responses the middleware doesn't
// render — static files and API JSON; src/middleware.ts uses it (with a per-request nonce) for every page.
//
// Pages carry a nonce instead of 'unsafe-inline' (2026-10-23 security review): Next stamps the nonce on its own
// inline scripts, so an injected <script> can't run even if a rendering bug ever let one through. Nonces need a
// per-request render, which is why the root layout is force-dynamic. Plain-file pages (public/guides/*.html) keep
// 'unsafe-inline': they are static, carry no tenant data and are never served through the middleware.

type CspOptions = {
  /** Per-request nonce for pages. Omitted = the static-file policy ('unsafe-inline'). */
  nonce?: string;
  /** /demo runs the browser receptionist: WASM resampling + the ElevenLabs socket. */
  voiceDemo?: boolean;
};

export function buildCsp({ nonce, voiceDemo }: CspOptions = {}): string {
  const dev = process.env.NODE_ENV !== "production";
  const script = [
    "'self'",
    nonce ? `'nonce-${nonce}'` : "'unsafe-inline'",
    // 'unsafe-eval' is only for `next dev` (React's dev tooling); a production build never evals.
    dev ? "'unsafe-eval'" : "",
    voiceDemo ? "'wasm-unsafe-eval'" : "",
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ? "https://us-assets.i.posthog.com" : "",
  ].filter(Boolean).join(" ");
  const connect = [
    "'self'",
    // Firebase Auth (identitytoolkit/securetoken), Firestore, and Installations
    // all live under *.googleapis.com — the client SDK calls these directly
    // from the browser. Without this, connect-src falls back to default-src
    // 'self' and every fetch/XHR to them is silently blocked (this was a live
    // incident: "Firebase: Error (auth/network-request-failed)" on /login).
    "https://*.googleapis.com",
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ? "https://us.i.posthog.com https://us-assets.i.posthog.com" : "",
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL ?? "",
    voiceDemo ? "https://api.elevenlabs.io wss://api.elevenlabs.io" : "",
  ].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // Call recordings: ElevenLabs audio streams through our own /api route, but older Vapi lines link their storage URL.
    // Media can't run code, so any https source is acceptable here.
    "media-src 'self' blob: https:",
    `connect-src ${connect}`,
    // Firebase Auth's redirect-sign-in flow (signInWithRedirect/getRedirectResult)
    // relays its result back to the app through a hidden iframe it embeds from the
    // project's authDomain (business-expense-trackin-ef659.firebaseapp.com). With no
    // frame-src directive this fell back to default-src 'self' and silently blocked
    // that iframe, so Google sign-in failed with the same opaque "auth/internal-error"
    // the popup->redirect fix (7aa1f855) was meant to resolve — email/password sign-in
    // was unaffected since it never loads that iframe.
    "frame-src 'self' https://business-expense-trackin-ef659.firebaseapp.com",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

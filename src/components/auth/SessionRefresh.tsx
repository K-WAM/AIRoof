"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { safeExpiry, writeSessionCookie } from "@/lib/auth/sessionFetch";

/** If the re-check hasn't replaced this screen by then, the session really is gone. */
const GIVE_UP_MS = 8_000;

/**
 * Shown by the Admin/Hub layouts when the __session cookie can't be verified on the server (see
 * requireSuperadminPage). Gets a fresh ID token from the still-signed-in browser, writes it, and asks the server to
 * re-check. A passing check swaps this out for the shell (unmounting it); no Firebase user, an error, or no swap
 * within GIVE_UP_MS → /login. Renders no privileged content.
 */
export function SessionRefresh() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const toLogin = () => router.replace(`/login?next=${encodeURIComponent(pathname || "/admin")}`);
    const giveUp = window.setTimeout(toLogin, GIVE_UP_MS);
    let cancelled = false;
    (async () => {
      try {
        const { getFirebaseAuth } = await import("@/lib/firebase/client");
        const [auth, { onAuthStateChanged }] = await Promise.all([getFirebaseAuth(), import("firebase/auth")]);
        if (cancelled) return;
        if (!auth) return toLogin();
        const user = await new Promise<import("firebase/auth").User | null>((resolve) => {
          const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
        });
        if (cancelled) return;
        if (!user) return toLogin();
        const result = await user.getIdTokenResult(true);
        if (cancelled) return;
        writeSessionCookie(result.token, safeExpiry(result.expirationTime));
        router.refresh();
      } catch {
        if (!cancelled) toLogin();
      }
    })();
    return () => { cancelled = true; window.clearTimeout(giveUp); };
  }, [router, pathname]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      Loading…
    </div>
  );
}

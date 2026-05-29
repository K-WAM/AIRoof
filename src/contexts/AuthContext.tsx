"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onIdTokenChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

interface AuthUser {
  uid: string;
  email: string | null;
  businessId?: string;
  businessName?: string;
  role?: "superadmin" | "owner" | "staff" | "viewer";
  superadmin?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  idToken: string | null;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  idToken: null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    // onIdTokenChanged fires on sign-in, sign-out, and automatic token refresh (~every hour).
    // Storing the actual ID token in __session lets server-side API routes verify auth.
    const unsub = onIdTokenChanged(auth, async (firebaseUser: User | null) => {
      if (!firebaseUser) {
        setUser(null);
        setIdToken(null);
        setLoading(false);
        document.cookie = "__session=; path=/; max-age=0; SameSite=Strict";
        return;
      }

      try {
        const token = await firebaseUser.getIdToken();
        setIdToken(token);
        // Store actual ID token so server routes can verify with Firebase Admin SDK.
        // Expires in 1h matching Firebase token lifetime; onIdTokenChanged refreshes it.
        document.cookie = `__session=${token}; path=/; max-age=3600; SameSite=Strict`;

        let profile: AuthUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
        };

        if (db) {
          const snap = await getDoc(doc(db, "businessUsers", firebaseUser.uid));
          if (snap.exists()) {
            const data = snap.data();
            profile = { ...profile, ...data };
          }
        }

        setUser(profile);
      } catch (err) {
        console.error("Auth profile load failed:", err);
        setUser({ uid: firebaseUser.uid, email: firebaseUser.email });
      } finally {
        setLoading(false);
      }
    });

    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, idToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

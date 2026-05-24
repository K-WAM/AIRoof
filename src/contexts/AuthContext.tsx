"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
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

    const unsub = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (!firebaseUser) {
        setUser(null);
        setIdToken(null);
        setLoading(false);
        return;
      }

      try {
        const token = await firebaseUser.getIdToken();
        setIdToken(token);

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

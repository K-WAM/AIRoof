// Firebase Client SDK initialization (browser-safe)
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Check if required env vars are present
const isConfigValid =
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId;

let app: ReturnType<typeof initializeApp> | null = null;

if (isConfigValid) {
  app = initializeApp(firebaseConfig);
}

const getFirebaseApp = () => {
  if (!app) {
    throw new Error(
      "Firebase not configured. Check NEXT_PUBLIC_FIREBASE_* env vars."
    );
  }
  return app;
};

export const auth = isConfigValid ? getAuth(getFirebaseApp()) : null;
export const db = isConfigValid ? getFirestore(getFirebaseApp()) : null;

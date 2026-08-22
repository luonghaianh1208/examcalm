import "server-only";

import { getApps, initializeApp, cert, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

const ADMIN_APP_NAME = "examcalm-admin";

export function getAdminApp(): App {
  const existing = getApps().find((a) => a.name === ADMIN_APP_NAME);
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credential = raw
    ? cert(JSON.parse(raw) as Record<string, string>)
    : applicationDefault();

  return initializeApp(
    { credential, projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID },
    ADMIN_APP_NAME,
  );
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}

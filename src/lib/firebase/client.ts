"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const useEmulator = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

let dbInstance: Firestore | null = null;
let appCheckStarted = false;

export function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth {
  const auth = getAuth(getFirebaseApp());
  if (useEmulator && !("__examcalmEmulator" in auth)) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    Object.defineProperty(auth, "__examcalmEmulator", { value: true });
  }
  return auth;
}

/**
 * Firestore với offline persistence (spec §7.4): ghi vào IndexedDB trước,
 * SDK tự đồng bộ khi có mạng — submit test/mood không mất dữ liệu.
 */
export function getDb(): Firestore {
  if (dbInstance) return dbInstance;

  const app = getFirebaseApp();
  try {
    dbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Đã được khởi tạo ở nơi khác (ví dụ Fast Refresh) — dùng lại instance có sẵn.
    dbInstance = getFirestore(app);
  }

  if (useEmulator) {
    connectFirestoreEmulator(dbInstance, "127.0.0.1", 8080);
  }
  return dbInstance;
}

/**
 * App Check ở chế độ monitor-only cho Spec #1 (spec §5.3):
 * gắn token vào request để xem số liệu, nhưng CHƯA bật enforce ở Console.
 * Bỏ qua hoàn toàn khi chạy Emulator.
 */
export function startAppCheck(): void {
  if (appCheckStarted || useEmulator || typeof window === "undefined") return;
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!siteKey) return;

  initializeAppCheck(getFirebaseApp(), {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  appCheckStarted = true;
}

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

// Hình dạng lỗi mà Firestore SDK ném ra (FirestoreError) — dùng để phân biệt
// lỗi "đã khởi tạo rồi" với lỗi thật (misconfig...) mà không cần import class lỗi.
interface FirestoreLikeError {
  code?: string;
  message?: string;
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
  } catch (err) {
    // Chỉ nuốt đúng lỗi "Firestore đã được khởi tạo rồi" (ví dụ Fast Refresh
    // re-eval module nhưng app trong registry của SDK vẫn còn) — mọi lỗi khác
    // (misconfig, v.v.) phải throw tiếp, nếu không sẽ âm thầm mất persistence.
    const fsErr = err as FirestoreLikeError;
    const isAlreadyInitialized =
      fsErr.code === "failed-precondition" && (fsErr.message ?? "").includes("already");
    if (!isAlreadyInitialized) {
      throw err;
    }
    dbInstance = getFirestore(app);
  }

  // Marker nằm trên instance Firestore (không phải biến module-scope) vì Fast
  // Refresh reset lại module scope nhưng instance/app trong registry của SDK
  // vẫn tồn tại — giống hệt cách getFirebaseAuth() đánh dấu bằng __examcalmEmulator.
  // Thiếu marker này thì connectFirestoreEmulator() sẽ bị gọi lại trên client đã
  // start, và Firestore sẽ throw.
  if (useEmulator && !("__examcalmEmulator" in dbInstance)) {
    connectFirestoreEmulator(dbInstance, "127.0.0.1", 8080);
    Object.defineProperty(dbInstance, "__examcalmEmulator", { value: true });
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

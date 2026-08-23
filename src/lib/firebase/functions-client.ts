"use client";

import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { getFirebaseApp, ensureAuthReady } from "./client";

const REGION = "asia-southeast1";
let connected = false;

function functionsInstance() {
  const fns = getFunctions(getFirebaseApp(), REGION);
  if (process.env.NEXT_PUBLIC_USE_EMULATOR === "true" && !connected) {
    connectFunctionsEmulator(fns, "127.0.0.1", 5001);
    connected = true;
  }
  return fns;
}

/**
 * Khớp response thật của Cloud Function `setUserRole` (functions/src/admin/setUserRole.ts):
 * claim (auth) là nguồn sự thật, ghi mirror users/{uid} có thể lỗi mà KHÔNG throw —
 * mirrorWriteFailed cho caller biết claim đã đổi nhưng bản hiển thị có thể tạm chưa khớp.
 */
export type SetUserRoleResult = {
  ok: true;
  role: "student" | "admin";
  mirrorWriteFailed?: boolean;
};

export async function callSetUserRole(
  targetUid: string,
  role: "student" | "admin",
): Promise<SetUserRoleResult> {
  // Đóng race giữa lần điều hướng trang đầu tiên và lúc client Auth khôi phục
  // xong currentUser từ persistence — cùng lý do ensureAuthReady() ở client.ts
  // được gọi trước mọi lần ghi Firestore. Thiếu bước này, request gọi callable
  // đi ra trước khi ID token sẵn sàng, server thấy request.auth = undefined và
  // từ chối với "Bạn cần đăng nhập." dù người dùng thực sự đã đăng nhập.
  await ensureAuthReady();
  const fn = httpsCallable<{ targetUid: string; role: string }, SetUserRoleResult>(
    functionsInstance(),
    "setUserRole",
  );
  const result = await fn({ targetUid, role });
  return result.data;
}

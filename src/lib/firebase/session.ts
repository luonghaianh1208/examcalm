import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "./admin";
import { ensureUserProfile } from "@/lib/firestore/ensure-user-profile";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  sessionCookieOptions,
} from "./session-config";

export type SessionUser = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  role: "student" | "admin";
};

export async function createSessionCookie(idToken: string): Promise<void> {
  // Xác minh idToken TRƯỚC để lấy uid + role claim đã xác minh — cần cho việc vá
  // hồ sơ users/{uid} thiếu bên dưới (xem ensureUserProfile). Hành vi với token
  // không hợp lệ không đổi: ném lỗi ở đây, POST /api/session vẫn trả 401 qua catch.
  const decoded = await adminAuth().verifyIdToken(idToken);
  const cookie = await adminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_MS,
  });
  const store = await cookies();
  store.set(
    SESSION_COOKIE_NAME,
    cookie,
    sessionCookieOptions(process.env.NODE_ENV === "production"),
  );

  // Vá hồ sơ THIẾU cho tài khoản bootstrap ngoài app (Console/CLI) — không bao giờ
  // ném lỗi ra ngoài (xem ensureUserProfile), nên không ảnh hưởng gì tới đăng nhập.
  await ensureUserProfile(
    decoded.uid,
    decoded.role === "admin" ? "admin" : "student",
    decoded.email ?? null,
  );
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/** Trả về user đã xác minh, hoặc null. Không bao giờ ném lỗi. */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    // cookies() có thể ném lỗi ngoài request context (vd: prerender tĩnh) —
    // phải nằm trong try để giữ đúng cam kết "không bao giờ ném lỗi".
    const store = await cookies();
    const cookie = store.get(SESSION_COOKIE_NAME)?.value;
    if (!cookie) return null;

    // checkRevoked = true: đăng xuất mọi thiết bị có tác dụng ngay.
    const claims = await adminAuth().verifySessionCookie(cookie, true);
    return {
      uid: claims.uid,
      email: claims.email ?? null,
      emailVerified: claims.email_verified === true,
      // role là custom claim không có kiểu tĩnh trên DecodedIdToken; mặc định
      // "student" là hướng fail-closed có chủ đích.
      role: claims.role === "admin" ? "admin" : "student",
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/dang-nhap");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/dang-nhap");
  if (user.role !== "admin") redirect("/");
  return user;
}

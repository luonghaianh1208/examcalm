"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  deleteUser,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { z } from "zod";
import { getFirebaseAuth, getDb, ensureAuthReady } from "@/lib/firebase/client";
import { DEFAULT_PRIVACY_SETTINGS } from "@/lib/types/user";

export const signUpInputSchema = z.object({
  email: z.string().email("Email không hợp lệ."),
  password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự."),
  nickname: z.string().trim().min(1, "Hãy nhập biệt danh.").max(50),
  gradeLevel: z.enum(["10", "11", "12"]),
  school: z.string().trim().min(1, "Hãy nhập tên trường.").max(120),
  examGoals: z.array(z.string().max(100)).max(10),
});

export type SignUpInput = z.infer<typeof signUpInputSchema>;

/** Đổi ID token lấy session cookie để Server Component nhận diện được user. */
export async function establishSession(user: User): Promise<void> {
  const idToken = await user.getIdToken(true);
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error("Không tạo được phiên đăng nhập.");
}

export async function signUp(input: SignUpInput): Promise<void> {
  const parsed = signUpInputSchema.parse(input);
  const auth = getFirebaseAuth();

  const cred = await createUserWithEmailAndPassword(auth, parsed.email, parsed.password);

  try {
    // Đóng race giống saveMoodLog/saveTestAttempt — xem giải thích ensureAuthReady()
    // ở client.ts. Ở đây hậu quả nặng hơn: với offline persistence, setDoc() dưới
    // đây sẽ resolve ở local dù request thật bị Rules từ chối, nên catch không bao
    // giờ chạy tới, deleteUser() dọn dẹp không được gọi, và học sinh bị kẹt lại với
    // tài khoản Auth "mồ côi" — đúng thứ đoạn cleanup này được viết ra để tránh.
    await ensureAuthReady();

    // Ghi hồ sơ TRƯỚC khi verify — rules cho phép create users mà không đòi email_verified.
    await setDoc(doc(getDb(), "users", cred.user.uid), {
      uid: cred.user.uid,
      role: "student",
      nickname: parsed.nickname,
      gradeLevel: parsed.gradeLevel,
      school: parsed.school,
      examGoals: parsed.examGoals,
      privacySettings: { ...DEFAULT_PRIVACY_SETTINGS },
      researchConsent: null,
      deletionRequestedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // Ghi hồ sơ thất bại → xoá luôn tài khoản Auth vừa tạo, tránh để lại tài khoản
    // "mồ côi" (có Auth nhưng không có hồ sơ) mà học sinh không có cách nào tự sửa.
    try {
      await deleteUser(cred.user);
    } catch {
      // Xoá cũng thất bại: học sinh thực sự kẹt lại — báo lỗi trung thực, không gợi ý
      // "đăng nhập lại" vì tài khoản này không có hồ sơ để đăng nhập vào.
      throw Object.assign(new Error("signup-cleanup-failed"), { code: "auth/signup-cleanup-failed" });
    }
    throw err;
  }

  await sendEmailVerification(cred.user);
  await establishSession(cred.user);
}

export async function signIn(email: string, password: string): Promise<void> {
  const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  await establishSession(cred.user);
}

export async function signOutEverywhere(): Promise<void> {
  await signOut(getFirebaseAuth());
  await fetch("/api/session", { method: "DELETE" });
}

export async function resendVerificationEmail(): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Chưa đăng nhập.");
  await sendEmailVerification(user);
}

/** Thông báo lỗi Firebase Auth bằng tiếng Việt, không lộ chi tiết kỹ thuật. */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  switch (code) {
    case "auth/email-already-in-use":
      return "Email này đã được đăng ký. Bạn thử đăng nhập nhé.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email hoặc mật khẩu chưa đúng.";
    case "auth/weak-password":
      return "Mật khẩu này chưa đủ an toàn. Bạn thử một mật khẩu khác dài hơn nhé.";
    case "auth/too-many-requests":
      return "Bạn thử lại sau ít phút nhé.";
    case "auth/network-request-failed":
      return "Mất kết nối mạng. Kiểm tra lại đường truyền giúp mình.";
    case "auth/signup-cleanup-failed":
      return "Có lỗi khi tạo tài khoản. Bạn thử lại với một email khác, hoặc liên hệ người quản trị trang nếu vẫn gặp lỗi.";
    default:
      return "Có lỗi xảy ra. Bạn thử lại sau nhé.";
  }
}

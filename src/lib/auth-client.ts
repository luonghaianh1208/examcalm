"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { z } from "zod";
import { getFirebaseAuth, getDb } from "@/lib/firebase/client";
import { DEFAULT_PRIVACY_SETTINGS } from "@/lib/types/user";

export const signUpInputSchema = z.object({
  email: z.string().email("Email không hợp lệ."),
  password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự."),
  nickname: z.string().min(1, "Hãy nhập biệt danh.").max(50),
  gradeLevel: z.enum(["10", "11", "12"]),
  school: z.string().min(1, "Hãy nhập tên trường.").max(120),
  examGoals: z.array(z.string().max(100)).max(10),
});

export type SignUpInput = z.infer<typeof signUpInputSchema>;

/** Đổi ID token lấy session cookie để Server Component nhận diện được user. */
async function establishSession(user: User): Promise<void> {
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
    case "auth/too-many-requests":
      return "Bạn thử lại sau ít phút nhé.";
    case "auth/network-request-failed":
      return "Mất kết nối mạng. Kiểm tra lại đường truyền giúp mình.";
    default:
      return "Có lỗi xảy ra. Bạn thử lại sau nhé.";
  }
}

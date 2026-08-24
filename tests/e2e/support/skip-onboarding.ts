import { initializeApp, cert, applicationDefault, getApps, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * Bỏ qua WelcomeDialog + OnboardingTour (src/components/onboarding/) cho một tài khoản E2E vừa
 * tạo. Hai UI này chỉ hiện MỘT LẦN cho học sinh vừa xác thực email — đúng lúc kịch bản AI cần
 * tương tác với trang ngay sau khi verify — và WelcomeDialog là một dialog modal focus-trap che
 * kín màn hình, chặn mọi click vào nút "Mở nhật ký cảm xúc" cho tới khi bị đóng.
 *
 * Onboarding không liên quan gì tới lớp AI đang được kiểm chứng ở tests/e2e/ai.spec.ts — thay vì
 * lái UI để bấm qua welcome dialog rồi bốn bước tour (thêm bề mặt có thể vỡ, không đo được gì cho
 * spec AI), ghi thẳng trạng thái "đã thấy hết" giống một tài khoản kỳ cựu: OnboardingController
 * chỉ render khi `state.welcomeSeenAt === null` (WelcomeDialog) hoặc `!hideTooltips` (OnboardingTour)
 * — set cả hai field này tắt hẳn nhánh render đó (xem src/components/onboarding/OnboardingController.tsx).
 */
function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return initializeApp({
    credential: raw ? cert(JSON.parse(raw) as Record<string, string>) : applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "examcalm-dev",
  });
}

/**
 * Nhận EMAIL (không phải uid) vì caller (tests/e2e/ai.spec.ts) chỉ vừa signUp() qua UI thật —
 * không có sẵn uid. Tra ngược qua Auth Emulator bằng Admin SDK, giống cách
 * tests/e2e/support/auth-emulator.ts tra oobCode theo email.
 */
export async function skipOnboarding(email: string): Promise<void> {
  const app = adminApp();
  const user = await getAuth(app).getUserByEmail(email);
  await getFirestore(app).collection("users").doc(user.uid).set(
    { onboarding: { welcomeSeenAt: FieldValue.serverTimestamp(), hideTooltips: true } },
    { merge: true },
  );
}

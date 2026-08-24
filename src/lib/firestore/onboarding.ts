"use client";

import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import type { OnboardingState } from "@/lib/types/user";

const DEFAULT_STATE: OnboardingState = { welcomeSeenAt: null, hideTooltips: false };

/**
 * Đọc trạng thái onboarding của học sinh. Hồ sơ CŨ (tạo trước khi có tính năng
 * này) không có field `onboarding` — coi như chưa từng thấy gì (giá trị mặc định).
 * Đọc lỗi cũng trả về mặc định thay vì throw: onboarding chỉ là tiện ích dẫn
 * dắt, không được chặn học sinh dùng app nếu Firestore trục trặc.
 */
export async function getOnboarding(uid: string): Promise<OnboardingState> {
  // Đóng race giống mọi lần đọc/ghi Firestore khác trong codebase — xem giải
  // thích ensureAuthReady() ở client.ts.
  await ensureAuthReady();
  try {
    const snap = await getDoc(doc(getDb(), "users", uid));
    const onboarding = snap.data()?.onboarding as
      | { welcomeSeenAt?: Timestamp | null; hideTooltips?: boolean }
      | undefined;
    if (!onboarding) return DEFAULT_STATE;
    return {
      welcomeSeenAt: onboarding.welcomeSeenAt instanceof Timestamp ? onboarding.welcomeSeenAt.toDate() : null,
      hideTooltips: onboarding.hideTooltips === true,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

/**
 * Ghi nhận đã thấy welcome dialog. Chỉ set field `onboarding.welcomeSeenAt`
 * (không phải cả object `onboarding`) — setDoc({merge: true}) với object lồng
 * nhau chỉ merge đúng field lá được liệt kê, nên `onboarding.hideTooltips` nếu
 * đã có từ trước sẽ được giữ nguyên, không bị ghi đè về false.
 */
export async function markWelcomeSeen(uid: string): Promise<void> {
  await ensureAuthReady();
  try {
    await setDoc(
      doc(getDb(), "users", uid),
      { onboarding: { welcomeSeenAt: serverTimestamp() } },
      { merge: true },
    );
  } catch {
    // Ghi thất bại không được chặn học sinh dùng app — welcome dialog chỉ đơn
    // giản có thể hiện lại lần sau, không phải lỗi nghiêm trọng.
  }
}

/** Bật/tắt "không hiện lại hướng dẫn". Cùng lý do swallow lỗi như markWelcomeSeen(). */
export async function setHideTooltips(uid: string, hide: boolean): Promise<void> {
  await ensureAuthReady();
  try {
    await setDoc(
      doc(getDb(), "users", uid),
      { onboarding: { hideTooltips: hide } },
      { merge: true },
    );
  } catch {
    // Ghi thất bại không được chặn học sinh dùng app — xem giải thích ở trên.
  }
}

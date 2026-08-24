"use client";

import { doc, getDoc } from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";

/**
 * Đọc privacySettings.aiOptIn của chính học sinh (users/{uid}) — dùng để
 * ReflectionCard tự quyết định có gọi callable AI hay không (Task 11b, quyết
 * định 1). Đọc document của chính mình không phải là gửi dữ liệu ra ngoài,
 * nên an toàn để đọc trực tiếp ở đây thay vì kéo prop `aiOptIn` qua các
 * component không liên quan gì tới AI.
 */
export async function getAiOptIn(uid: string): Promise<boolean> {
  // Đóng race giống mọi lần đọc/ghi Firestore khác trong codebase — xem giải
  // thích ensureAuthReady() ở client.ts.
  await ensureAuthReady();
  try {
    const snap = await getDoc(doc(getDb(), "users", uid));
    return snap.data()?.privacySettings?.aiOptIn === true;
  } catch {
    // Đọc lỗi (mất mạng...) -> coi như chưa bật, an toàn hơn là tự ý gọi
    // callable AI khi không chắc trạng thái đồng ý của học sinh.
    return false;
  }
}

"use client";

import { doc, getDoc } from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import { hasCurrentAiConsent } from "@/lib/types/ai-consent";

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

/**
 * I4 (final whole-branch review): đọc CẢ `aiOptIn` LẪN `aiConsentVersion`, trả về true CHỈ KHI
 * đồng ý đã lưu đủ mới để dùng CHAT — xem hasCurrentAiConsent (ai-consent.ts) để biết vì sao
 * một đồng ý `aiOptIn=true` từ TRƯỚC khi chat tồn tại (thiếu hoặc lệch `aiConsentVersion`)
 * không đủ. KHÔNG dùng cho ReflectionCard.tsx — phản chiếu vẫn dùng `getAiOptIn` ở trên nguyên
 * vẹn, vì phạm vi dữ liệu của phản chiếu không đổi (chỉ chat mới mới thêm sau đồng ý cũ).
 */
export async function getChatConsent(uid: string): Promise<boolean> {
  await ensureAuthReady();
  try {
    const snap = await getDoc(doc(getDb(), "users", uid));
    const privacySettings = snap.data()?.privacySettings as
      | { aiOptIn?: unknown; aiConsentVersion?: unknown }
      | undefined;
    const aiOptIn = privacySettings?.aiOptIn === true;
    const aiConsentVersion =
      typeof privacySettings?.aiConsentVersion === "number" ? privacySettings.aiConsentVersion : null;
    return hasCurrentAiConsent(aiOptIn, aiConsentVersion);
  } catch {
    return false;
  }
}

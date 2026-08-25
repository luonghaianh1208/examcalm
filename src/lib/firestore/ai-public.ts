"use client";

import { doc, getDoc } from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";

export type AiPublicConfig = {
  providerLabel: string;
  /** Chỉ quyết định MỘT điều: màn hình đồng ý (AiConsentSection.tsx) có hiện ô tick "aiOptIn"
   *  hay không. true khi ÍT NHẤT MỘT trong hai tính năng sẵn sàng — KHÔNG PHẢI cả hai đều bật.
   *  Task 9 fix round 1, Finding 2: KHÔNG dùng field này để gate quyền dùng một tính năng CỤ
   *  THỂ — dùng reflectionEnabled/chatEnabled bên dưới. */
  enabled: boolean;
  /** true khi và chỉ khi tính năng PHẢN CHIẾU sẵn sàng — ReflectionCard.tsx gate TRÊN field
   *  này. */
  reflectionEnabled: boolean;
  /** true khi và chỉ khi tính năng CHAT sẵn sàng — ChatWindow.tsx gate TRÊN field này. */
  chatEnabled: boolean;
};

// "Chưa khả dụng" — dùng chung cho: document chưa tồn tại (Task 12, admin
// console, là nơi DUY NHẤT ghi document này — cho tới lúc đó nó vắng mặt ở
// mọi môi trường), providerLabel rỗng, hoặc enabled=false. Cả bốn đều là
// trạng thái "chưa cấu hình xong" bình thường, không phải lỗi. reflectionEnabled/
// chatEnabled=false ở đây LUÔN đúng khi enabled=false: enabled là OR của hai field đó
// (functions/src/ai/config.ts, isAiEnabled), nên OR=false kéo theo cả hai đều false.
const UNAVAILABLE: AiPublicConfig = {
  providerLabel: "", enabled: false, reflectionEnabled: false, chatEnabled: false,
};

/**
 * Đọc systemConfig/aiPublic — document DUY NHẤT dưới systemConfig mà học
 * sinh đã đăng nhập được đọc trực tiếp (xem ngoại lệ hẹp trong
 * firestore.rules và tests/rules/ai.test.ts). KHÔNG BAO GIỜ đọc
 * systemConfig/aiConfig từ client: rule khoá admin-only, học sinh gọi sẽ
 * nhận PERMISSION_DENIED.
 */
export async function getAiPublicConfig(): Promise<AiPublicConfig> {
  // Đóng race giống mọi lần đọc/ghi Firestore khác trong codebase — xem giải
  // thích ensureAuthReady() ở client.ts.
  await ensureAuthReady();
  try {
    const snap = await getDoc(doc(getDb(), "systemConfig", "aiPublic"));
    const data = snap.data();
    if (!data) return UNAVAILABLE;
    const providerLabel = typeof data.providerLabel === "string" ? data.providerLabel : "";
    const enabled = data.enabled === true;
    if (providerLabel === "" || !enabled) return UNAVAILABLE;
    return {
      providerLabel,
      enabled: true,
      reflectionEnabled: data.reflectionEnabled === true,
      chatEnabled: data.chatEnabled === true,
    };
  } catch {
    // Đọc lỗi (mất mạng...) không được chặn màn hình đồng ý — coi như chưa
    // khả dụng, an toàn hơn là mời học sinh bật một tính năng không rõ trạng thái.
    return UNAVAILABLE;
  }
}

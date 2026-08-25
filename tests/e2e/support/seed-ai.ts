import { initializeApp, cert, applicationDefault, getApps, type App } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * Seed/clear `systemConfig/aiConfig` + `systemConfig/aiPublic` cho kịch bản E2E "AI đã bật"
 * (tests/e2e/ai.spec.ts). Ghi ĐÚNG hình dạng mà saveAiConfig() (src/lib/firestore/admin-ai.ts)
 * ghi trong production — hai document tách rời nhưng phải khớp nhau (aiPublic là bản công khai,
 * derive từ aiConfig) — để test không lỡ seed một hình dạng aiPublic sai mà production không
 * bao giờ tạo ra.
 *
 * Dùng cùng kiểu khởi tạo App admin với tests/e2e/support/seed-sample-test.ts — không export dùng
 * chung: hai file độc lập, mỗi file tự đủ (khớp phong cách hiện có của thư mục support/).
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
 * Seed một cấu hình AI HỢP LỆ và ĐANG BẬT (killSwitch tắt, baseUrl/model khác rỗng) — đúng điều
 * kiện `isAiEnabled()` (src/lib/firestore/admin-ai.ts) để `systemConfig/aiPublic.enabled = true`,
 * mở cổng cho màn hình đồng ý AI (AiConsentSection) hiện nút bật thay vì trạng thái "chưa khả dụng".
 *
 * baseUrl trỏ tới một host KHÔNG có thật (`https://e2e-fake-provider.invalid/v1`) — E2E suite này
 * không khởi động Functions emulator (xem giải thích ở đầu tests/e2e/ai.spec.ts), nên không có gì
 * thực sự gọi tới baseUrl này; nó chỉ cần khác rỗng để `isAiEnabled()` trả về true.
 */
export async function seedAiEnabled(providerLabel = "E2E Test Provider"): Promise<void> {
  const db = getFirestore(adminApp());

  await db.collection("systemConfig").doc("aiConfig").set({
    providerLabel,
    baseUrl: "https://e2e-fake-provider.invalid/v1",
    model: "e2e-fake-model",
    temperature: 0.7,
    maxTokens: 500,
    quotaStudentPerDay: 5,
    // M9 (final whole-branch review): ba field chat thiếu ở đây khiến fixture này mô tả một
    // cấu hình sản phẩm KHÔNG THỂ tồn tại thật (aiConfigSchema đòi cả ba field này) — dùng
    // safeParse ở phía đọc sẽ fail-closed về DEFAULT_AI_CONFIG một cách âm thầm.
    chatQuotaPerDay: 0,
    rateLimitPerMinute: 3,
    chatRateLimitPerMinute: 20,
    killSwitch: { moodReflection: false, chat: true },
    // Spec #5: cùng lý do M9 ở trên — thiếu hai field này khiến fixture mô tả một cấu hình
    // aiConfigSchema đòi hỏi nhưng không thật sự có, fail-closed âm thầm về DEFAULT_AI_CONFIG.
    crisisEmailEnabled: false,
    crisisEmailFrom: "",
    updatedBy: "e2e-suite",
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Task 9 fix round 1, Finding 2: aiPublic giờ mang thêm reflectionEnabled/chatEnabled RIÊNG —
  // aiConfig ở trên chỉ tắt killSwitch.moodReflection (chat vẫn mặc định tắt), nên chỉ
  // reflectionEnabled mới true, khớp đúng shape saveAiConfig() thật sự ghi (isReflectionEnabled/
  // isChatEnabled, functions/src/ai/config.ts) cho đúng cấu hình này.
  await db.collection("systemConfig").doc("aiPublic").set({
    providerLabel,
    enabled: true,
    reflectionEnabled: true,
    chatEnabled: false,
  });
}

/**
 * Task 10 (tests/e2e/chat.spec.ts) — biến thể của seedAiEnabled() ở trên, bật RIÊNG tính năng
 * TRÒ CHUYỆN thay vì phản chiếu (killSwitch.chat = false thay vì killSwitch.moodReflection,
 * chatQuotaPerDay > 0 thay vì quotaStudentPerDay — đúng điều kiện `chatReady` của isAiEnabled(),
 * src/lib/firestore/admin-ai.ts). Giữ phản chiếu TẮT (killSwitch.moodReflection: true,
 * quotaStudentPerDay: 0) để kịch bản chat không vô tình phụ thuộc hay lẫn với trạng thái phản
 * chiếu — hai công tắc độc lập hoàn toàn (design spec §10, Fix round 1 Task 5 Finding 2b), nên
 * bài test của tính năng này chỉ nên bật đúng MỘT công tắc nó cần.
 */
export async function seedChatEnabled(providerLabel = "E2E Chat Test Provider"): Promise<void> {
  const db = getFirestore(adminApp());

  await db.collection("systemConfig").doc("aiConfig").set({
    providerLabel,
    baseUrl: "https://e2e-fake-provider.invalid/v1",
    model: "e2e-fake-model",
    temperature: 0.7,
    maxTokens: 500,
    quotaStudentPerDay: 0,
    chatQuotaPerDay: 30,
    rateLimitPerMinute: 3,
    chatRateLimitPerMinute: 20,
    killSwitch: { moodReflection: true, chat: false },
    crisisEmailEnabled: false,
    crisisEmailFrom: "",
    updatedBy: "e2e-suite",
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db.collection("systemConfig").doc("aiPublic").set({
    providerLabel,
    enabled: true,
    reflectionEnabled: false,
    chatEnabled: true,
  });
}

/**
 * Xoá hai document đã seed — gọi ở `test.afterAll` của kịch bản "AI đã bật" để không rò rỉ trạng
 * thái "tính năng đang bật" sang các spec file khác chạy sau trong CÙNG một lượt `playwright test`
 * (emulator Firestore dùng chung cho toàn bộ suite, không reset giữa các file).
 */
export async function clearAiConfig(): Promise<void> {
  const db = getFirestore(adminApp());
  await db.collection("systemConfig").doc("aiConfig").delete();
  await db.collection("systemConfig").doc("aiPublic").delete();
}

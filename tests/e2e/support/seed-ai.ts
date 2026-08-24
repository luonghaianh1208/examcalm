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
    rateLimitPerMinute: 3,
    killSwitch: { moodReflection: false },
    updatedBy: "e2e-suite",
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db.collection("systemConfig").doc("aiPublic").set({
    providerLabel,
    enabled: true,
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

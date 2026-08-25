// Test ráp callable saveAiConfig trên Firestore emulator, cùng khuôn với testConnection.test.ts
// và generateReflection.test.ts: gọi thẳng `runSaveAiConfig` (lõi có thể test được) với
// Firestore emulator thật. BẮT BUỘC chạy với FIRESTORE_EMULATOR_HOST đã set (`npm test`).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { runSaveAiConfig } from "./saveAiConfig";
import { DEFAULT_AI_CONFIG, type AiConfig } from "../ai/config";
import { PermissionDeniedError, type CallerAuth } from "./guards";

let app: App;
let db: Firestore;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "saveAiConfig.test.ts cần Firestore emulator: chạy `npm test` (đã bọc sẵn " +
        "firebase emulators:exec) thay vì gọi vitest trực tiếp mà không có emulator.",
    );
  }
  process.env.METADATA_SERVER_DETECTION = "none";
  // App MẶC ĐỊNH (không đặt tên) — khác testConnection.test.ts/quota.test.ts (app đặt tên,
  // vì code test ở đó nhận `db` qua deps và không bao giờ đụng default app). writeAuditLog()
  // (functions/src/audit/writeAuditLog.ts) gọi getFirestore() KHÔNG kèm app — tức luôn dùng
  // app mặc định — nên phải initializeApp() mặc định ở đây để nó tìm thấy app.
  app = initializeApp({ projectId: "examcalm-saveaiconfig-test" });
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await db.recursiveDelete(db.collection("systemConfig"));
  await db.recursiveDelete(db.collection("auditLogs"));
});

const ADMIN_AUTH: CallerAuth = { uid: "admin1", token: { role: "admin" } };
const STUDENT_AUTH: CallerAuth = { uid: "student1", token: { role: "student" } };

const VALID_CONFIG: AiConfig = {
  providerLabel: "DeepSeek",
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  temperature: 0.7,
  maxTokens: 500,
  quotaStudentPerDay: 5,
  chatQuotaPerDay: 30,
  rateLimitPerMinute: 3,
  chatRateLimitPerMinute: 20,
  killSwitch: { moodReflection: false, chat: true },
  crisisEmailEnabled: false,
  crisisEmailFrom: "",
};

describe("runSaveAiConfig", () => {
  it("từ chối khi chưa đăng nhập", async () => {
    await expect(runSaveAiConfig(undefined, VALID_CONFIG, { db })).rejects.toThrow(PermissionDeniedError);
  });

  it("từ chối student — chỉ admin mới được sửa cấu hình AI", async () => {
    await expect(runSaveAiConfig(STUDENT_AUTH, VALID_CONFIG, { db })).rejects.toThrow(PermissionDeniedError);
  });

  it("dữ liệu không hợp lệ -> throw, KHÔNG ghi gì", async () => {
    await expect(
      runSaveAiConfig(ADMIN_AUTH, { ...VALID_CONFIG, temperature: 5 }, { db }),
    ).rejects.toThrow();

    const snap = await db.collection("systemConfig").doc("aiConfig").get();
    expect(snap.exists).toBe(false);
  });

  it("ghi ATOMIC cả aiConfig VÀ aiPublic, aiPublic derive đúng enabled", async () => {
    await runSaveAiConfig(ADMIN_AUTH, VALID_CONFIG, { db });

    const aiConfigSnap = await db.collection("systemConfig").doc("aiConfig").get();
    expect(aiConfigSnap.data()).toMatchObject({
      providerLabel: "DeepSeek", baseUrl: VALID_CONFIG.baseUrl, model: VALID_CONFIG.model,
      updatedBy: "admin1",
    });

    const aiPublicSnap = await db.collection("systemConfig").doc("aiPublic").get();
    // Task 9 fix round 1, Finding 2: aiPublic giờ mang thêm reflectionEnabled/chatEnabled RIÊNG
    // cho từng tính năng — VALID_CONFIG bật phản chiếu (killSwitch.moodReflection=false), tắt
    // chat (killSwitch.chat=true).
    expect(aiPublicSnap.data()).toEqual({
      providerLabel: "DeepSeek", enabled: true, reflectionEnabled: true, chatEnabled: false,
    });
  });

  // Task 9 fix round 1, Finding 2 (CRITICAL — reviewer): đúng kịch bản §10 design spec — admin
  // bật RIÊNG chat, giữ phản chiếu tắt. `enabled` phải vẫn true (OR, mở ô tick đồng ý), nhưng
  // `reflectionEnabled` PHẢI false — nếu không, ReflectionCard sẽ mở cổng dù killSwitch.moodReflection
  // còn tắt, và một học sinh viết nhật ký sẽ hứng lỗi resource-exhausted ngay lập tức.
  it("Finding 2: kịch bản §10 (chỉ bật chat) -> enabled=true (ô tick vẫn hiện), reflectionEnabled=false, chatEnabled=true", async () => {
    await runSaveAiConfig(
      ADMIN_AUTH,
      { ...VALID_CONFIG, killSwitch: { moodReflection: true, chat: false } },
      { db },
    );

    const aiPublicSnap = await db.collection("systemConfig").doc("aiPublic").get();
    expect(aiPublicSnap.data()).toEqual({
      providerLabel: "DeepSeek", enabled: true, reflectionEnabled: false, chatEnabled: true,
    });
  });

  it("killSwitch bật -> aiPublic.enabled=false dù baseUrl/model đã điền", async () => {
    await runSaveAiConfig(
      ADMIN_AUTH,
      { ...VALID_CONFIG, killSwitch: { moodReflection: true, chat: true } },
      { db },
    );

    const aiPublicSnap = await db.collection("systemConfig").doc("aiPublic").get();
    expect(aiPublicSnap.data()?.enabled).toBe(false);
  });

  // M8 (final whole-branch review): quotaStudentPerDay=0 nghĩa là "không lượt nào" — nếu
  // isAiEnabled() bỏ qua field này, aiPublic.enabled=true mời học sinh bật một tính năng mà
  // mọi lượt gọi đều rớt resource-exhausted ngay lập tức.
  it("M8: quotaStudentPerDay=0 -> aiPublic.enabled=false dù mọi field khác đều hợp lệ", async () => {
    await runSaveAiConfig(ADMIN_AUTH, { ...VALID_CONFIG, quotaStudentPerDay: 0 }, { db });

    const aiPublicSnap = await db.collection("systemConfig").doc("aiPublic").get();
    expect(aiPublicSnap.data()?.enabled).toBe(false);
  });

  // I5: hành động mạnh nhất của tính năng (đổi baseUrl — kênh đọc nguyên văn ghi chú học sinh
  // còn mạnh hơn quyền đọc aiJournalOutputs mà admin bị cấm) phải để lại dấu vết audit.
  it("I5: ghi auditLogs với before/after của baseUrl, providerLabel, killSwitch", async () => {
    await db.collection("systemConfig").doc("aiConfig").set({
      ...DEFAULT_AI_CONFIG,
      providerLabel: "OldProvider",
      baseUrl: "https://old.example.com/v1",
      killSwitch: { moodReflection: true, chat: true },
    });

    await runSaveAiConfig(
      ADMIN_AUTH,
      { ...VALID_CONFIG, providerLabel: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
      { db },
    );

    const logSnap = await db.collection("auditLogs").where("action", "==", "saveAiConfig").get();
    expect(logSnap.size).toBe(1);
    const entry = logSnap.docs[0]?.data();
    expect(entry?.actorUid).toBe("admin1");
    expect(entry?.before).toEqual({
      baseUrl: "https://old.example.com/v1",
      providerLabel: "OldProvider",
      killSwitch: { moodReflection: true, chat: true },
    });
    expect(entry?.after).toEqual({
      baseUrl: "https://api.deepseek.com/v1",
      providerLabel: "DeepSeek",
      killSwitch: { moodReflection: false, chat: true },
    });
  });

  it("từ chối student -> KHÔNG ghi auditLogs nào", async () => {
    await expect(runSaveAiConfig(STUDENT_AUTH, VALID_CONFIG, { db })).rejects.toThrow();

    const logSnap = await db.collection("auditLogs").get();
    expect(logSnap.empty).toBe(true);
  });
});

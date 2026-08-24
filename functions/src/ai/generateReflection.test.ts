// Test ráp toàn bộ callable generateReflection trên Firestore emulator. Gọi thẳng
// `runGenerateReflection` (lõi có thể test được, tách khỏi onCall thật của Cloud Functions)
// với một `callChatCompletion` GIẢ được tiêm qua deps — không một byte nào ra mạng thật.
//
// BẮT BUỘC chạy với FIRESTORE_EMULATOR_HOST đã set (do `firebase emulators:exec` set tự
// động, xem script "test" trong package.json). Chạy bằng: `npm test`.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  runGenerateReflection,
  type GenerateReflectionCallerAuth,
  type GenerateReflectionDeps,
} from "./generateReflection";
import { AiProviderError, type ChatCompletionResult } from "./openaiClient";
import { REFLECTION_LABEL, CAT_STORY_LABEL, JOURNAL_PROMPT_LABEL } from "./parseOutput";
import { DEFAULT_AI_CONFIG, type AiConfig } from "./config";

let app: App;
let db: Firestore;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "generateReflection.test.ts cần Firestore emulator: chạy `npm test` (đã bọc sẵn " +
        "firebase emulators:exec) thay vì gọi vitest trực tiếp mà không có emulator.",
    );
  }
  // Không có metadata server GCP trên máy chạy test — tắt dò tìm để tránh
  // MetadataLookupWarning làm bẩn test output (yêu cầu "test output sạch, không warning").
  process.env.METADATA_SERVER_DETECTION = "none";
  app = initializeApp({ projectId: "examcalm-reflection-test" }, "reflection-test-app");
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const COLLECTIONS = [
  "systemConfig",
  "users",
  "moodLogs",
  "aiUsage",
  "aiJournalOutputs",
  "aiSafetyLog",
  "promptTemplates",
];

beforeEach(async () => {
  await Promise.all(COLLECTIONS.map((name) => db.recursiveDelete(db.collection(name))));
});

const STUDENT_UID = "student1";
const OTHER_UID = "someone-else";
const AUTH_OK: GenerateReflectionCallerAuth = { uid: STUDENT_UID, emailVerified: true };

const VALID_MODEL_TEXT = [
  REFLECTION_LABEL,
  "Có vẻ như hôm nay là một ngày không dễ dàng với bạn.",
  CAT_STORY_LABEL,
  "Chú mèo cuộn tròn cạnh bạn, im lặng đồng hành một lúc.",
  JOURNAL_PROMPT_LABEL,
  "Điều gì khiến bạn thấy nhẹ nhõm hơn một chút hôm nay?",
].join("\n");

async function setAiConfig(overrides: Partial<AiConfig> = {}): Promise<void> {
  const config: AiConfig = {
    ...DEFAULT_AI_CONFIG,
    baseUrl: "https://fake-provider.test/v1",
    model: "fake-model-v1",
    providerLabel: "FakeProvider",
    quotaStudentPerDay: 5,
    rateLimitPerMinute: 0, // tắt rate limit để các test không phụ thuộc khoảng cách thời gian
    killSwitch: { moodReflection: false },
    ...overrides,
  };
  await db.collection("systemConfig").doc("aiConfig").set(config);
}

async function setUser(uid: string, aiOptIn: boolean): Promise<void> {
  await db
    .collection("users")
    .doc(uid)
    .set({ uid, role: "student", privacySettings: { aiOptIn, shareImageWithAI: false } });
}

async function setMoodLog(id: string, userId: string): Promise<void> {
  await db.collection("moodLogs").doc(id).set({
    userId,
    moodScore: 5,
    moodIcon: "neutral",
    note: "hôm nay hơi mệt vì ôn thi",
    tags: [],
    context: "standalone",
  });
}

/** callChatCompletion giả, trả về `text` cố định, spy được để khẳng định KHÔNG bị gọi. */
function fakeCallChatCompletion(
  text: string,
): (...args: unknown[]) => Promise<ChatCompletionResult> {
  return vi.fn(async (): Promise<ChatCompletionResult> => ({ text, finishReason: "stop" }));
}

function makeDeps(overrides: Partial<GenerateReflectionDeps> = {}): GenerateReflectionDeps {
  return {
    db,
    now: new Date("2026-08-24T02:00:00Z"),
    apiKey: "fake-api-key",
    callChatCompletion: fakeCallChatCompletion(VALID_MODEL_TEXT),
    ...overrides,
  };
}

describe("generateReflection", () => {
  it("1. chưa đăng nhập → unauthenticated", async () => {
    await expect(
      runGenerateReflection(undefined, { moodLogId: "m1" }, makeDeps()),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("2. email chưa xác thực → permission-denied", async () => {
    await expect(
      runGenerateReflection(
        { uid: STUDENT_UID, emailVerified: false },
        { moodLogId: "m1" },
        makeDeps(),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("3. killSwitch.moodReflection === true → failed-precondition, callChatCompletion KHÔNG được gọi", async () => {
    await setAiConfig({ killSwitch: { moodReflection: true } });
    await setUser(STUDENT_UID, true);
    await setMoodLog("m1", STUDENT_UID);
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);

    await expect(
      runGenerateReflection(AUTH_OK, { moodLogId: "m1" }, makeDeps({ callChatCompletion: fake })),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(fake).not.toHaveBeenCalled();
  });

  it("4. aiConfig.baseUrl rỗng (chưa cấu hình) → failed-precondition, không gọi mạng", async () => {
    await setAiConfig({ baseUrl: "" });
    await setUser(STUDENT_UID, true);
    await setMoodLog("m1", STUDENT_UID);
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);

    await expect(
      runGenerateReflection(AUTH_OK, { moodLogId: "m1" }, makeDeps({ callChatCompletion: fake })),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(fake).not.toHaveBeenCalled();
  });

  it("5. privacySettings.aiOptIn === false → permission-denied, callChatCompletion KHÔNG được gọi", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, false);
    await setMoodLog("m1", STUDENT_UID);
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);

    await expect(
      runGenerateReflection(AUTH_OK, { moodLogId: "m1" }, makeDeps({ callChatCompletion: fake })),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(fake).not.toHaveBeenCalled();
  });

  it("6. quota hết → resource-exhausted, không gọi mạng", async () => {
    await setAiConfig({ quotaStudentPerDay: 1 });
    await setUser(STUDENT_UID, true);
    await setMoodLog("m1", STUDENT_UID);
    const now = new Date("2026-08-24T02:00:00Z");
    // Đã dùng hết lượt duy nhất trong ngày trước khi gọi.
    await db
      .collection("aiUsage")
      .doc(`${STUDENT_UID}_2026-08-24`)
      .set({ uid: STUDENT_UID, date: "2026-08-24", count: 1, updatedAt: Timestamp.fromDate(now) });
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);

    await expect(
      runGenerateReflection(AUTH_OK, { moodLogId: "m1" }, makeDeps({ now, callChatCompletion: fake })),
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(fake).not.toHaveBeenCalled();
  });

  it("7. moodLogId không tồn tại → not-found", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);

    await expect(
      runGenerateReflection(AUTH_OK, { moodLogId: "does-not-exist" }, makeDeps()),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("8. mood log của người khác → permission-denied", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setMoodLog("m1", OTHER_UID);

    await expect(
      runGenerateReflection(AUTH_OK, { moodLogId: "m1" }, makeDeps()),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("9. đường đi thuận lợi → ghi aiJournalOutputs với đủ trường, gồm providerLabel và model", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setMoodLog("m1", STUDENT_UID);

    const result = await runGenerateReflection(AUTH_OK, { moodLogId: "m1" }, makeDeps());
    expect(result.outputId).toBeTruthy();

    const snap = await db.collection("aiJournalOutputs").doc(result.outputId).get();
    expect(snap.exists).toBe(true);
    const data = snap.data();
    expect(data?.userId).toBe(STUDENT_UID);
    expect(data?.moodLogId).toBe("m1");
    expect(data?.providerLabel).toBe("FakeProvider");
    expect(data?.model).toBe("fake-model-v1");
    expect(data?.reflectionText).toBeTruthy();
    expect(data?.catStoryText).toBeTruthy();
    expect(data?.journalPrompt).toBeTruthy();
    expect(data?.userFeedback).toBeNull();
    expect(typeof data?.promptTemplateId).toBe("string");
    expect(typeof data?.promptVersion).toBe("number");
    expect(data?.createdAt).toBeTruthy();
  });

  it("10. checkOutputSafety trả safe:false → KHÔNG ghi aiJournalOutputs, ném internal, ghi aiSafetyLog (chỉ 4 field cho phép)", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setMoodLog("m1", STUDENT_UID);
    const unsafeText = [
      REFLECTION_LABEL,
      "Có vẻ như bạn đang bị trầm cảm.",
      CAT_STORY_LABEL,
      "Mèo con ở đây bên bạn.",
      JOURNAL_PROMPT_LABEL,
      "Bạn cảm thấy thế nào?",
    ].join("\n");
    const fake = fakeCallChatCompletion(unsafeText);

    await expect(
      runGenerateReflection(AUTH_OK, { moodLogId: "m1" }, makeDeps({ callChatCompletion: fake })),
    ).rejects.toMatchObject({ code: "internal" });

    const outputs = await db.collection("aiJournalOutputs").get();
    expect(outputs.empty).toBe(true);

    const safetyLogs = await db.collection("aiSafetyLog").get();
    expect(safetyLogs.size).toBe(1);
    const logData = safetyLogs.docs[0].data();
    // Chỉ đúng 4 field cho phép — không uid, không output text.
    expect(Object.keys(logData).sort()).toEqual(
      ["createdAt", "model", "promptTemplateId", "triggeredKeyword"].sort(),
    );
    expect(logData.model).toBe("fake-model-v1");
    expect(logData.triggeredKeyword).toContain("trầm cảm");
    expect(JSON.stringify(logData)).not.toContain(STUDENT_UID);
  });

  it("11. parseReflectionOutput trả null → không ghi, ném internal", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setMoodLog("m1", STUDENT_UID);
    const fake = fakeCallChatCompletion("Đây là một câu trả lời không đúng định dạng nhãn.");

    await expect(
      runGenerateReflection(AUTH_OK, { moodLogId: "m1" }, makeDeps({ callChatCompletion: fake })),
    ).rejects.toMatchObject({ code: "internal" });

    const outputs = await db.collection("aiJournalOutputs").get();
    expect(outputs.empty).toBe(true);
  });

  // Fix round 1, Finding 4: message của AiProviderError phải THỰC SỰ chứa baseUrl/key/status
  // để hai assertion not.toContain có "răng" — bản cũ dùng message không chứa gì trong số đó
  // nên pass với BẤT KỲ implementation nào, kể cả một implementation lộ error.message thẳng
  // ra ngoài.
  it("12. callChatCompletion ném AiProviderError → callable ném internal, không lộ baseUrl/key/status", async () => {
    await setAiConfig({ baseUrl: "https://secret-provider.example/v1" });
    await setUser(STUDENT_UID, true);
    await setMoodLog("m1", STUDENT_UID);
    const fake = vi.fn(async () => {
      throw new AiProviderError(
        "server",
        "POST https://secret-provider.example/v1 failed, key=fake-api-key, 500",
      );
    });

    let caught: unknown;
    try {
      await runGenerateReflection(AUTH_OK, { moodLogId: "m1" }, makeDeps({ callChatCompletion: fake }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ code: "internal" });
    const message = (caught as Error).message;
    expect(message).not.toContain("secret-provider.example");
    expect(message).not.toContain("500");
    expect(message).not.toContain("fake-api-key");
  });

  it("13. quota chỉ bị trừ khi thực sự gọi model — kill switch bật → aiUsage không đổi", async () => {
    await setAiConfig({ killSwitch: { moodReflection: true } });
    await setUser(STUDENT_UID, true);
    await setMoodLog("m1", STUDENT_UID);
    const now = new Date("2026-08-24T02:00:00Z");

    await expect(
      runGenerateReflection(AUTH_OK, { moodLogId: "m1" }, makeDeps({ now })),
    ).rejects.toMatchObject({ code: "failed-precondition" });

    const usageSnap = await db.collection("aiUsage").doc(`${STUDENT_UID}_2026-08-24`).get();
    expect(usageSnap.exists).toBe(false);
  });

  // Fix round 1, Finding 1: quota bây giờ đứng SAU not-found/ownership — moodLogId sai hay
  // không thuộc về mình không bao giờ chạm provider, nên không được trừ lượt.
  it("13b. moodLogId không tồn tại → aiUsage không đổi (quota đứng sau not-found)", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    const now = new Date("2026-08-24T02:00:00Z");

    await expect(
      runGenerateReflection(AUTH_OK, { moodLogId: "does-not-exist" }, makeDeps({ now })),
    ).rejects.toMatchObject({ code: "not-found" });

    const usageSnap = await db.collection("aiUsage").doc(`${STUDENT_UID}_2026-08-24`).get();
    expect(usageSnap.exists).toBe(false);
  });

  it("13c. mood log của người khác → aiUsage không đổi (quota đứng sau ownership)", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setMoodLog("m1", OTHER_UID);
    const now = new Date("2026-08-24T02:00:00Z");

    await expect(
      runGenerateReflection(AUTH_OK, { moodLogId: "m1" }, makeDeps({ now })),
    ).rejects.toMatchObject({ code: "permission-denied" });

    const usageSnap = await db.collection("aiUsage").doc(`${STUDENT_UID}_2026-08-24`).get();
    expect(usageSnap.exists).toBe(false);
  });

  // Ngược lại: một request THỰC SỰ đi ra ngoài (dù provider trả lỗi) đã bị trừ quota — không
  // rollback, vì request có thể đã bị provider tính phí.
  it("13d. callChatCompletion ném AiProviderError → aiUsage VẪN bị trừ (request đã đi ra ngoài)", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setMoodLog("m1", STUDENT_UID);
    const now = new Date("2026-08-24T02:00:00Z");
    const fake = vi.fn(async () => {
      throw new AiProviderError("server", "AI provider trả về lỗi.");
    });

    await expect(
      runGenerateReflection(AUTH_OK, { moodLogId: "m1" }, makeDeps({ now, callChatCompletion: fake })),
    ).rejects.toMatchObject({ code: "internal" });

    const usageSnap = await db.collection("aiUsage").doc(`${STUDENT_UID}_2026-08-24`).get();
    expect(usageSnap.exists).toBe(true);
    expect(usageSnap.data()?.count).toBe(1);
  });
});

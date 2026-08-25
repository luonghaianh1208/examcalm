// Test ráp toàn bộ callable sendChatMessage trên Firestore emulator. Gọi thẳng
// `runSendChatMessage` (lõi có thể test được, tách khỏi onCall thật của Cloud Functions) với
// một `callChatCompletion` GIẢ được tiêm qua deps — không một byte nào ra mạng thật.
//
// BẮT BUỘC chạy với FIRESTORE_EMULATOR_HOST đã set (do `firebase emulators:exec` set tự
// động, xem script "test" trong package.json). Chạy bằng: `npm test`.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  runSendChatMessage,
  type SendChatMessageCallerAuth,
  type SendChatMessageDeps,
} from "./sendChatMessage";
import { AiProviderError, type ChatCompletionResult } from "./openaiClient";
import { CRISIS_REPLY_TEXT, CONCERN_LEVEL_LABEL } from "./buildChatPrompt";
import { DEFAULT_AI_CONFIG, type AiConfig } from "./config";

let app: App;
let db: Firestore;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "sendChatMessage.test.ts cần Firestore emulator: chạy `npm test` (đã bọc sẵn " +
        "firebase emulators:exec) thay vì gọi vitest trực tiếp mà không có emulator.",
    );
  }
  // Không có metadata server GCP trên máy chạy test — tắt dò tìm để tránh
  // MetadataLookupWarning làm bẩn test output (yêu cầu "test output sạch, không warning").
  process.env.METADATA_SERVER_DETECTION = "none";
  app = initializeApp({ projectId: "examcalm-chat-test" }, "chat-test-app");
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const COLLECTIONS = [
  "systemConfig",
  "users",
  "chatSessions",
  "chatMessages",
  "crisisAlerts",
  "aiUsage",
  "aiSafetyLog",
];

beforeEach(async () => {
  await Promise.all(COLLECTIONS.map((name) => db.recursiveDelete(db.collection(name))));
});

const STUDENT_UID = "student1";
const OTHER_UID = "someone-else";
const AUTH_OK: SendChatMessageCallerAuth = { uid: STUDENT_UID, emailVerified: true };
const SESSION_ID = "session1";

const NORMAL_REPLY_TEXT = "Nghe có vẻ hôm nay khá vất vả với bạn.";
const VALID_MODEL_TEXT = [NORMAL_REPLY_TEXT, "", `${CONCERN_LEVEL_LABEL} none`].join("\n");

async function setAiConfig(overrides: Partial<AiConfig> = {}): Promise<void> {
  const config: AiConfig = {
    ...DEFAULT_AI_CONFIG,
    baseUrl: "https://fake-provider.test/v1",
    model: "fake-model-v1",
    providerLabel: "FakeProvider",
    chatQuotaPerDay: 30,
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

async function setChatSession(sessionId: string, userId: string): Promise<void> {
  await db.collection("chatSessions").doc(sessionId).set({
    userId,
    startedAt: new Date(),
    lastMessageAt: new Date(),
    messageCount: 0,
  });
}

/** callChatCompletion giả, trả về `text` cố định, spy được để khẳng định KHÔNG bị gọi. */
function fakeCallChatCompletion(
  text: string,
): (...args: unknown[]) => Promise<ChatCompletionResult> {
  return vi.fn(async (): Promise<ChatCompletionResult> => ({ text, finishReason: "stop" }));
}

function makeDeps(overrides: Partial<SendChatMessageDeps> = {}): SendChatMessageDeps {
  return {
    db,
    now: new Date("2026-08-24T02:00:00Z"),
    apiKey: "fake-api-key",
    callChatCompletion: fakeCallChatCompletion(VALID_MODEL_TEXT),
    ...overrides,
  };
}

async function getSessionMessagesAsc(sessionId: string) {
  const snap = await db
    .collection("chatMessages")
    .where("sessionId", "==", sessionId)
    .orderBy("createdAt", "asc")
    .get();
  return snap.docs.map((d) => d.data());
}

describe("sendChatMessage", () => {
  it("1. chưa đăng nhập → unauthenticated", async () => {
    await expect(
      runSendChatMessage(undefined, { sessionId: SESSION_ID, text: "Xin chào" }, makeDeps()),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("2. email chưa xác thực → permission-denied, details.reason = email_unverified", async () => {
    await expect(
      runSendChatMessage(
        { uid: STUDENT_UID, emailVerified: false },
        { sessionId: SESSION_ID, text: "Xin chào" },
        makeDeps(),
      ),
    ).rejects.toMatchObject({
      code: "permission-denied",
      details: { reason: "email_unverified" },
    });
  });

  it("3. killSwitch.moodReflection === true → failed-precondition, callChatCompletion KHÔNG được gọi", async () => {
    await setAiConfig({ killSwitch: { moodReflection: true } });
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);

    await expect(
      runSendChatMessage(
        AUTH_OK,
        { sessionId: SESSION_ID, text: "Xin chào" },
        makeDeps({ callChatCompletion: fake }),
      ),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(fake).not.toHaveBeenCalled();
  });

  it("4. aiConfig.baseUrl rỗng (chưa cấu hình) → failed-precondition, không gọi mạng", async () => {
    await setAiConfig({ baseUrl: "" });
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);

    await expect(
      runSendChatMessage(
        AUTH_OK,
        { sessionId: SESSION_ID, text: "Xin chào" },
        makeDeps({ callChatCompletion: fake }),
      ),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(fake).not.toHaveBeenCalled();
  });

  it("5. privacySettings.aiOptIn === false → permission-denied, details.reason = ai_opt_in, callChatCompletion KHÔNG được gọi", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, false);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);

    await expect(
      runSendChatMessage(
        AUTH_OK,
        { sessionId: SESSION_ID, text: "Xin chào" },
        makeDeps({ callChatCompletion: fake }),
      ),
    ).rejects.toMatchObject({
      code: "permission-denied",
      details: { reason: "ai_opt_in" },
    });
    expect(fake).not.toHaveBeenCalled();
  });

  it("6a. sessionId không tồn tại → not-found", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);

    await expect(
      runSendChatMessage(AUTH_OK, { sessionId: "does-not-exist", text: "Xin chào" }, makeDeps()),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("6b. session của người khác → permission-denied, KHÔNG kèm details", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, OTHER_UID);

    let caught: unknown;
    try {
      await runSendChatMessage(AUTH_OK, { sessionId: SESSION_ID, text: "Xin chào" }, makeDeps());
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ code: "permission-denied" });
    expect((caught as { details?: unknown }).details).toBeUndefined();
  });

  it("7. Lớp 1 bắt được mức urgent → ghi crisisAlerts + chatMessages(user + CRISIS_REPLY_TEXT), KHÔNG gọi callChatCompletion, KHÔNG trừ quota", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);
    const now = new Date("2026-08-24T02:00:00Z");

    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em muốn tự tử" },
      makeDeps({ now, callChatCompletion: fake }),
    );

    expect(fake).not.toHaveBeenCalled();

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1);
    expect(alerts.docs[0].data()).toMatchObject({
      userId: STUDENT_UID,
      severity: "urgent",
      triggeredBy: "keyword",
    });

    const messages = await getSessionMessagesAsc(SESSION_ID);
    expect(messages.length).toBe(2);
    expect(messages[0]).toMatchObject({
      role: "user",
      text: "Em muốn tự tử",
      isCrisisResponse: false,
    });
    expect(messages[1]).toMatchObject({
      role: "assistant",
      text: CRISIS_REPLY_TEXT,
      isCrisisResponse: true,
    });

    const usageSnap = await db.collection("aiUsage").doc(`${STUDENT_UID}_2026-08-24`).get();
    expect(usageSnap.exists).toBe(false);
  });

  it("7b. Lớp 1 mức concern → ghi crisisAlerts NHƯNG vẫn gọi model, dùng phản hồi của nó, VẪN trừ quota", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);
    const now = new Date("2026-08-24T02:00:00Z");

    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em thấy tuyệt vọng quá" },
      makeDeps({ now, callChatCompletion: fake }),
    );

    expect(fake).toHaveBeenCalledTimes(1);

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1);
    expect(alerts.docs[0].data()).toMatchObject({ severity: "concern", triggeredBy: "keyword" });

    const messages = await getSessionMessagesAsc(SESSION_ID);
    expect(messages[1]).toMatchObject({ role: "assistant", text: NORMAL_REPLY_TEXT, isCrisisResponse: false });

    const usageSnap = await db.collection("aiUsage").doc(`${STUDENT_UID}_2026-08-24`).get();
    expect(usageSnap.data()?.count).toBe(1);
  });

  it("8. hết quota → resource-exhausted, không gọi mạng", async () => {
    await setAiConfig({ chatQuotaPerDay: 1 });
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const now = new Date("2026-08-24T02:00:00Z");
    // Đã dùng hết lượt duy nhất trong ngày trước khi gọi.
    await db
      .collection("aiUsage")
      .doc(`${STUDENT_UID}_2026-08-24`)
      .set({ uid: STUDENT_UID, date: "2026-08-24", count: 1, updatedAt: now });
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);

    await expect(
      runSendChatMessage(
        AUTH_OK,
        { sessionId: SESSION_ID, text: "Xin chào" },
        makeDeps({ now, callChatCompletion: fake }),
      ),
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(fake).not.toHaveBeenCalled();

    const messages = await getSessionMessagesAsc(SESSION_ID);
    expect(messages.length).toBe(0);
  });

  it("9. đường thuận: ghi tin học sinh, gọi model, ghi tin trợ lý, cập nhật lastMessageAt/messageCount", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);

    const result = await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Hôm nay em hơi mệt" },
      makeDeps({ callChatCompletion: fake }),
    );
    expect(result.messageId).toBeTruthy();

    expect(fake).toHaveBeenCalledTimes(1);

    const messages = await getSessionMessagesAsc(SESSION_ID);
    expect(messages.length).toBe(2);
    expect(messages[0]).toMatchObject({
      userId: STUDENT_UID,
      sessionId: SESSION_ID,
      role: "user",
      text: "Hôm nay em hơi mệt",
      isCrisisResponse: false,
    });
    expect(messages[1]).toMatchObject({
      userId: STUDENT_UID,
      sessionId: SESSION_ID,
      role: "assistant",
      text: NORMAL_REPLY_TEXT,
      isCrisisResponse: false,
    });

    const sessionSnap = await db.collection("chatSessions").doc(SESSION_ID).get();
    expect(sessionSnap.data()?.messageCount).toBe(2);
    expect(sessionSnap.data()?.lastMessageAt).toBeTruthy();

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.empty).toBe(true);
  });

  it("10. Lớp 2 bắt được (model tự trả nhãn urgent) → vẫn ghi crisisAlerts, tin trợ lý là CRISIS_REPLY_TEXT chứ không phải nội dung model sinh ra", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const modelReply = ["Mình nghe thấy em đang rất đau khổ.", "", `${CONCERN_LEVEL_LABEL} urgent`].join("\n");
    const fake = fakeCallChatCompletion(modelReply);
    const now = new Date("2026-08-24T02:00:00Z");

    // Câu học sinh gõ KHÔNG chứa từ khoá lớp 1 nào — cô lập đúng lớp 2.
    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Hôm nay em thấy ổn." },
      makeDeps({ now, callChatCompletion: fake }),
    );

    expect(fake).toHaveBeenCalledTimes(1);

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1);
    expect(alerts.docs[0].data()).toMatchObject({ severity: "urgent", triggeredBy: "model" });

    const messages = await getSessionMessagesAsc(SESSION_ID);
    expect(messages[1]).toMatchObject({ role: "assistant", text: CRISIS_REPLY_TEXT, isCrisisResponse: true });
    expect(messages[1].text).not.toContain("Mình nghe thấy em đang rất đau khổ");

    // Model VẪN được gọi (không phải lớp 1 chặn) nên quota vẫn bị trừ.
    const usageSnap = await db.collection("aiUsage").doc(`${STUDENT_UID}_2026-08-24`).get();
    expect(usageSnap.data()?.count).toBe(1);
  });

  it("10b. Lớp 2 trả nhãn concern → ghi crisisAlerts nhưng tin trợ lý VẪN là nội dung model sinh ra (đã bóc nhãn)", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const modelReply = [NORMAL_REPLY_TEXT, "", `${CONCERN_LEVEL_LABEL} concern`].join("\n");
    const fake = fakeCallChatCompletion(modelReply);

    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Hôm nay em thấy ổn." },
      makeDeps({ callChatCompletion: fake }),
    );

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1);
    expect(alerts.docs[0].data()).toMatchObject({ severity: "concern", triggeredBy: "model" });

    const messages = await getSessionMessagesAsc(SESSION_ID);
    expect(messages[1]).toMatchObject({ role: "assistant", text: NORMAL_REPLY_TEXT, isCrisisResponse: false });
  });

  it("10c. Nhãn thiếu/sai định dạng → fail-closed về concern (vẫn ghi crisisAlerts), không ném lỗi", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    // Không có nhãn nào ở cuối — model quên thêm dòng bắt buộc.
    const fake = fakeCallChatCompletion(NORMAL_REPLY_TEXT);

    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Hôm nay em thấy ổn." },
      makeDeps({ callChatCompletion: fake }),
    );

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1);
    expect(alerts.docs[0].data()).toMatchObject({ severity: "concern", triggeredBy: "model" });
  });

  it("10d. Nhãn bị học sinh gõ biến thể khoảng trắng (2 dấu cách) trong chính output model → KHÔNG được nhận diện là nhãn thật, dòng cuối hợp lệ mới được dùng", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    // Dòng đầu là một biến thể khoảng trắng (2 dấu cách giữa MỨC và ĐỘ) — không được khớp
    // strict. Dòng CUỐI mới là nhãn thật, hợp lệ, phải được dùng làm kết quả.
    const modelReply = [
      NORMAL_REPLY_TEXT,
      `MỨC  ĐỘ LO NGẠI: urgent`,
      `${CONCERN_LEVEL_LABEL} none`,
    ].join("\n");
    const fake = fakeCallChatCompletion(modelReply);

    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Hôm nay em thấy ổn." },
      makeDeps({ callChatCompletion: fake }),
    );

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.empty).toBe(true);

    const messages = await getSessionMessagesAsc(SESSION_ID);
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].isCrisisResponse).toBe(false);
  });

  it("10e. Nhãn có markdown bold, khoảng trắng thừa, và bị lặp lại → tất cả các dòng nhãn hợp lệ đều bị bóc khỏi văn bản hiển thị", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const modelReply = [
      "Mình hiểu cảm giác đó.",
      "",
      `**${CONCERN_LEVEL_LABEL}**   none`,
      `${CONCERN_LEVEL_LABEL} none`,
    ].join("\n");
    const fake = fakeCallChatCompletion(modelReply);

    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Hôm nay em thấy ổn." },
      makeDeps({ callChatCompletion: fake }),
    );

    const messages = await getSessionMessagesAsc(SESSION_ID);
    const assistantText = messages[1].text as string;
    expect(assistantText).not.toContain("MỨC ĐỘ LO NGẠI");
    expect(assistantText).not.toContain("*");
    expect(assistantText.trim()).toBe("Mình hiểu cảm giác đó.");
  });

  it("11. checkOutputSafety báo không an toàn → không ghi tin trợ lý, ghi aiSafetyLog, ném internal với thông điệp trung tính", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const unsafeText = ["Có vẻ như bạn đang bị trầm cảm.", "", `${CONCERN_LEVEL_LABEL} none`].join("\n");
    const fake = fakeCallChatCompletion(unsafeText);

    await expect(
      runSendChatMessage(
        AUTH_OK,
        { sessionId: SESSION_ID, text: "Hôm nay em thấy ổn." },
        makeDeps({ callChatCompletion: fake }),
      ),
    ).rejects.toMatchObject({ code: "internal" });

    const messages = await getSessionMessagesAsc(SESSION_ID);
    // Tin học sinh vẫn được ghi (đã tốn quota); KHÔNG có tin trợ lý.
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe("user");

    const safetyLogs = await db.collection("aiSafetyLog").get();
    expect(safetyLogs.size).toBe(1);
    const logData = safetyLogs.docs[0].data();
    expect(Object.keys(logData).sort()).toEqual(
      ["createdAt", "model", "promptTemplateId", "triggeredKeyword"].sort(),
    );
    expect(logData.model).toBe("fake-model-v1");
    expect(logData.triggeredKeyword).toContain("trầm cảm");
    expect(JSON.stringify(logData)).not.toContain(STUDENT_UID);
  });

  it("12. lỗi provider → internal, không lộ baseUrl, model, hay nguyên văn lỗi provider", async () => {
    await setAiConfig({ baseUrl: "https://secret-provider.example/v1" });
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const fake = vi.fn(async () => {
      throw new AiProviderError(
        "server",
        "POST https://secret-provider.example/v1 failed, key=fake-api-key, 500",
      );
    });

    let caught: unknown;
    try {
      await runSendChatMessage(
        AUTH_OK,
        { sessionId: SESSION_ID, text: "Hôm nay em thấy ổn." },
        makeDeps({ callChatCompletion: fake }),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ code: "internal" });
    const message = (caught as Error).message;
    expect(message).not.toContain("secret-provider.example");
    expect(message).not.toContain("500");
    expect(message).not.toContain("fake-api-key");
  });

  it("12b. lỗi provider → aiUsage VẪN bị trừ (request đã đi ra ngoài)", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const now = new Date("2026-08-24T02:00:00Z");
    const fake = vi.fn(async () => {
      throw new AiProviderError("server", "AI provider trả về lỗi.");
    });

    await expect(
      runSendChatMessage(
        AUTH_OK,
        { sessionId: SESSION_ID, text: "Hôm nay em thấy ổn." },
        makeDeps({ now, callChatCompletion: fake }),
      ),
    ).rejects.toMatchObject({ code: "internal" });

    const usageSnap = await db.collection("aiUsage").doc(`${STUDENT_UID}_2026-08-24`).get();
    expect(usageSnap.exists).toBe(true);
    expect(usageSnap.data()?.count).toBe(1);
  });

  it("13. crisisAlerts được ghi KHÔNG có field nào chứa nguyên văn — Object.keys() đúng bằng danh sách cho phép", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);

    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em muốn tự tử" },
      makeDeps({ callChatCompletion: fake }),
    );

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1);
    const data = alerts.docs[0].data();
    expect(Object.keys(data).sort()).toEqual(
      ["userId", "severity", "triggeredBy", "createdAt", "handledBy", "handledAt"].sort(),
    );
    expect(JSON.stringify(data)).not.toContain("Em muốn tự tử");
  });

  it("14. quota chỉ bị trừ khi thật sự phát ra request tới provider — kill switch bật → aiUsage không đổi", async () => {
    await setAiConfig({ killSwitch: { moodReflection: true } });
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const now = new Date("2026-08-24T02:00:00Z");

    await expect(
      runSendChatMessage(AUTH_OK, { sessionId: SESSION_ID, text: "Xin chào" }, makeDeps({ now })),
    ).rejects.toMatchObject({ code: "failed-precondition" });

    const usageSnap = await db.collection("aiUsage").doc(`${STUDENT_UID}_2026-08-24`).get();
    expect(usageSnap.exists).toBe(false);
  });

  it("14b. sessionId không tồn tại → aiUsage không đổi (quota đứng sau not-found)", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    const now = new Date("2026-08-24T02:00:00Z");

    await expect(
      runSendChatMessage(
        AUTH_OK,
        { sessionId: "does-not-exist", text: "Xin chào" },
        makeDeps({ now }),
      ),
    ).rejects.toMatchObject({ code: "not-found" });

    const usageSnap = await db.collection("aiUsage").doc(`${STUDENT_UID}_2026-08-24`).get();
    expect(usageSnap.exists).toBe(false);
  });
});

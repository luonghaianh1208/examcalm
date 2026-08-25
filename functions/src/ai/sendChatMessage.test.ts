// Test ráp toàn bộ callable sendChatMessage trên Firestore emulator. Gọi thẳng
// `runSendChatMessage` (lõi có thể test được, tách khỏi onCall thật của Cloud Functions) với
// một `callChatCompletion` GIẢ được tiêm qua deps — không một byte nào ra mạng thật.
//
// BẮT BUỘC chạy với FIRESTORE_EMULATOR_HOST đã set (do `firebase emulators:exec` set tự
// động, xem script "test" trong package.json). Chạy bằng: `npm test`.
//
// Fix round 1 (review từ coordinator) — các test dưới đây phản ánh guard order MỚI:
// chưa đăng nhập → email chưa xác thực → input parse → aiOptIn tắt → session không tồn tại →
// session không sở hữu → LỚP 1 → kill switch (RIÊNG cho chat) → baseUrl rỗng → quota (RIÊNG
// cho chat, cả ngân sách ngày lẫn rate limit) → provider. Và một quyết định cảnh báo GỘP (một
// document, không phải mỗi lớp một document).

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
    rateLimitPerMinute: 0,
    chatRateLimitPerMinute: 0, // tắt rate limit chat mặc định để đa số test không phụ thuộc thời gian
    // chat BẬT (killSwitch.chat=false) mặc định trong test — kịch bản "tắt" test riêng.
    killSwitch: { moodReflection: false, chat: false },
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

const CHAT_USAGE_DOC = (uid: string, date: string) => `${uid}_chat_${date}`;

/**
 * Fix round 3, Finding 2: giả lập đúng kịch bản "composite index của crisisAlerts chưa build
 * kịp" — bọc `db` thật, CHỈ chặn đường TRUY VẤN (.where().where().where().limit().get()) của
 * collection `crisisAlerts`, còn `.add()`/`.doc()` vẫn đi thẳng qua collection thật (để test còn
 * xác nhận được cảnh báo THẬT SỰ được tạo sau khi fail-open). Mọi collection khác đi thẳng qua
 * `db` thật không đổi gì. Type assertion có chú thích: đây không phải `any` — chỉ đủ bề mặt
 * `Firestore` mà sendChatMessage.ts thực sự gọi tới (`collection`), không mô phỏng toàn bộ SDK.
 */
function makeDbWithRejectingCrisisAlertsQuery(realDb: Firestore): Firestore {
  const rejectingQueryChain = {
    where: () => rejectingQueryChain,
    limit: () => rejectingQueryChain,
    get: () => Promise.reject(new Error("FAILED_PRECONDITION: The query requires an index.")),
  };
  const wrapper = {
    collection: (name: string) => {
      const real = realDb.collection(name);
      if (name !== "crisisAlerts") return real;
      return {
        ...rejectingQueryChain,
        add: real.add.bind(real),
        doc: real.doc.bind(real),
      };
    },
  };
  return wrapper as unknown as Firestore;
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

  it("3. privacySettings.aiOptIn === false → permission-denied, details.reason = ai_opt_in, callChatCompletion KHÔNG được gọi (guard đứng TRƯỚC session — không cần tạo session)", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, false);
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

  it("4. sessionId không tồn tại → not-found", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);

    await expect(
      runSendChatMessage(AUTH_OK, { sessionId: "does-not-exist", text: "Xin chào" }, makeDeps()),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("5. session của người khác → permission-denied, KHÔNG kèm details", async () => {
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

  it("6. Lớp 1 mức urgent → ghi crisisAlerts + chatMessages(user + CRISIS_REPLY_TEXT), KHÔNG gọi callChatCompletion, KHÔNG trừ quota", async () => {
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

    const usageSnap = await db.collection("aiUsage").doc(CHAT_USAGE_DOC(STUDENT_UID, "2026-08-24")).get();
    expect(usageSnap.exists).toBe(false);
  });

  // Fix round 1, Finding 4 (ruling của coordinator): Lớp 1 giờ đứng TRÊN kill switch — một tin
  // urgent phải được phục vụ NGAY CẢ KHI killSwitch.chat đang bật (tính năng "đang tắt" theo
  // nghĩa vận hành thông thường). Đây là bằng chứng trực tiếp cho fix đó.
  it("6b. Lớp 1 urgent VẪN được phục vụ khi killSwitch.chat = true (tắt tính năng) — không bị failed-precondition", async () => {
    await setAiConfig({ killSwitch: { moodReflection: false, chat: true } });
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);

    const result = await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em muốn tự tử" },
      makeDeps({ callChatCompletion: fake }),
    );

    expect(result.messageId).toBeTruthy();
    expect(fake).not.toHaveBeenCalled();
    const messages = await getSessionMessagesAsc(SESSION_ID);
    expect(messages[1]).toMatchObject({ text: CRISIS_REPLY_TEXT, isCrisisResponse: true });
  });

  // Cùng tinh thần 6b: baseUrl rỗng cũng không được chặn một tin urgent.
  it("6c. Lớp 1 urgent VẪN được phục vụ khi baseUrl rỗng (chưa cấu hình provider)", async () => {
    await setAiConfig({ baseUrl: "" });
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);

    const result = await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em muốn tự tử" },
      makeDeps({ callChatCompletion: fake }),
    );

    expect(result.messageId).toBeTruthy();
    expect(fake).not.toHaveBeenCalled();
  });

  // ==== Fix round 2, Finding 2 — phanh chống-lụt cảnh báo (KHÔNG phải rate limit lên học sinh) ====
  it("6d. Hai tin urgent liên tiếp trong cửa sổ chống-lụt (5 phút) → CHỈ MỘT crisisAlerts được tạo, cả hai tin vẫn được lưu và trả CRISIS_REPLY_TEXT bình thường", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const t1 = new Date("2026-08-24T02:00:00Z");
    const t2 = new Date(t1.getTime() + 60_000); // 1 phút sau — trong cửa sổ 5 phút

    const r1 = await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em muốn tự tử" },
      makeDeps({ now: t1 }),
    );
    expect(r1.messageId).toBeTruthy();

    const r2 = await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em muốn tự tử lần nữa" },
      makeDeps({ now: t2 }),
    );
    expect(r2.messageId).toBeTruthy();

    // Học sinh KHÔNG bị chặn — cả hai tin đều được lưu, cả hai đều nhận CRISIS_REPLY_TEXT.
    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1);

    const messages = await getSessionMessagesAsc(SESSION_ID);
    expect(messages.length).toBe(4);
    expect(messages[1].text).toBe(CRISIS_REPLY_TEXT);
    expect(messages[3].text).toBe(CRISIS_REPLY_TEXT);
  });

  it("6e. Hai tin urgent cách nhau NGOÀI cửa sổ chống-lụt (>5 phút) → tin thứ hai VẪN tạo cảnh báo mới", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const t1 = new Date("2026-08-24T02:00:00Z");
    const t2 = new Date(t1.getTime() + 6 * 60_000); // 6 phút sau — ngoài cửa sổ 5 phút

    await runSendChatMessage(AUTH_OK, { sessionId: SESSION_ID, text: "Em muốn tự tử" }, makeDeps({ now: t1 }));
    await runSendChatMessage(AUTH_OK, { sessionId: SESSION_ID, text: "Em muốn tự tử" }, makeDeps({ now: t2 }));

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(2);
  });

  it("6f. Cảnh báo cũ ĐÃ xử lý (handledBy khác null), dù còn trong cửa sổ → tin urgent mới VẪN tạo cảnh báo mới", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const t1 = new Date("2026-08-24T02:00:00Z");

    await runSendChatMessage(AUTH_OK, { sessionId: SESSION_ID, text: "Em muốn tự tử" }, makeDeps({ now: t1 }));
    const firstAlerts = await db.collection("crisisAlerts").get();
    expect(firstAlerts.size).toBe(1);
    await firstAlerts.docs[0].ref.update({ handledBy: "teacher1", handledAt: t1 });

    const t2 = new Date(t1.getTime() + 60_000); // 1 phút sau — vẫn trong cửa sổ 5 phút
    await runSendChatMessage(AUTH_OK, { sessionId: SESSION_ID, text: "Em muốn tự tử" }, makeDeps({ now: t2 }));

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(2);
  });

  // ==== Fix round 3, Finding 1 — dedup phải NÂNG CẤP severity, không chỉ chặn boolean ====
  it("6g. Cảnh báo concern đang mở, tin urgent đến trong cửa sổ → NÂNG CẤP severity lên urgent, VẪN chỉ một document", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const t1 = new Date("2026-08-24T02:00:00Z");
    const fake1 = fakeCallChatCompletion(VALID_MODEL_TEXT);

    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em thấy tuyệt vọng quá" },
      makeDeps({ now: t1, callChatCompletion: fake1 }),
    );
    const firstAlerts = await db.collection("crisisAlerts").get();
    expect(firstAlerts.size).toBe(1);
    expect(firstAlerts.docs[0].data()).toMatchObject({ severity: "concern", triggeredBy: "keyword" });

    const t2 = new Date(t1.getTime() + 60_000); // 1 phút sau — trong cửa sổ 5 phút
    await runSendChatMessage(AUTH_OK, { sessionId: SESSION_ID, text: "Em muốn tự tử" }, makeDeps({ now: t2 }));

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1); // VẪN một document — cùng id đã có, không tạo thêm
    expect(alerts.docs[0].id).toBe(firstAlerts.docs[0].id);
    expect(alerts.docs[0].data()).toMatchObject({ severity: "urgent", triggeredBy: "keyword" });
  });

  it("6h. Cảnh báo urgent đang mở, tin concern đến trong cửa sổ → KHÔNG hạ cấp, cảnh báo vẫn urgent", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const t1 = new Date("2026-08-24T02:00:00Z");

    await runSendChatMessage(AUTH_OK, { sessionId: SESSION_ID, text: "Em muốn tự tử" }, makeDeps({ now: t1 }));
    const firstAlerts = await db.collection("crisisAlerts").get();
    expect(firstAlerts.size).toBe(1);

    const t2 = new Date(t1.getTime() + 60_000);
    const fake2 = fakeCallChatCompletion(VALID_MODEL_TEXT);
    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em thấy tuyệt vọng quá" },
      makeDeps({ now: t2, callChatCompletion: fake2 }),
    );

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1);
    expect(alerts.docs[0].id).toBe(firstAlerts.docs[0].id);
    expect(alerts.docs[0].data().severity).toBe("urgent"); // không bị hạ về "concern"
  });

  it("7. Lớp 1 mức concern (một mình, không có tín hiệu Lớp 2) → MỘT alert triggeredBy=keyword, vẫn gọi model, dùng phản hồi của nó, VẪN trừ quota", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT); // model tự chấm "none"
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

    const usageSnap = await db.collection("aiUsage").doc(CHAT_USAGE_DOC(STUDENT_UID, "2026-08-24")).get();
    expect(usageSnap.data()?.count).toBe(1);
  });

  it("7f. Hai tin concern liên tiếp trong cửa sổ chống-lụt → CHỈ MỘT crisisAlerts, nhưng model VẪN được gọi cho cả hai (phanh chỉ áp cho việc TẠO cảnh báo, không áp cho hội thoại)", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const t1 = new Date("2026-08-24T02:00:00Z");
    const t2 = new Date(t1.getTime() + 60_000);

    const fake1 = fakeCallChatCompletion(VALID_MODEL_TEXT);
    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em thấy tuyệt vọng quá" },
      makeDeps({ now: t1, callChatCompletion: fake1 }),
    );
    expect(fake1).toHaveBeenCalledTimes(1);

    const fake2 = fakeCallChatCompletion(VALID_MODEL_TEXT);
    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em vẫn thấy tuyệt vọng" },
      makeDeps({ now: t2, callChatCompletion: fake2 }),
    );
    expect(fake2).toHaveBeenCalledTimes(1);

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1);
  });

  // ==== Fix round 2, Finding 1 (CRITICAL) — cảnh báo Lớp 1 ghi NGAY khi phát hiện, PHẢI sống
  // sót qua mọi throw point phía sau (quota, lỗi provider, lọc an toàn). Bốn test dưới đây tái
  // hiện đúng bốn đường thất bại review đã chỉ ra — trước fix, cả bốn đều để crisisAlerts RỖNG.
  it("7g. Lớp 1 concern đã ghi cảnh báo → VƯỢT RATE LIMIT ngay sau đó → cảnh báo VẪN tồn tại", async () => {
    await setAiConfig({ chatRateLimitPerMinute: 20 }); // ngưỡng 3 giây/tin
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const t1 = new Date("2026-08-24T02:00:00.000Z");
    const t2 = new Date("2026-08-24T02:00:00.500Z"); // 500ms sau — dưới ngưỡng

    // Lượt đầu bình thường để tạo document aiUsage (rate limit chỉ áp khi đã có `existing`).
    await runSendChatMessage(AUTH_OK, { sessionId: SESSION_ID, text: "Xin chào" }, makeDeps({ now: t1 }));

    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);
    await expect(
      runSendChatMessage(
        AUTH_OK,
        { sessionId: SESSION_ID, text: "Em thấy tuyệt vọng quá" },
        makeDeps({ now: t2, callChatCompletion: fake }),
      ),
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(fake).not.toHaveBeenCalled();

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1);
    expect(alerts.docs[0].data()).toMatchObject({ severity: "concern", triggeredBy: "keyword" });
  });

  it("7h. Lớp 1 concern đã ghi cảnh báo → HẾT QUOTA NGÀY ngay sau đó → cảnh báo VẪN tồn tại", async () => {
    await setAiConfig({ chatQuotaPerDay: 1 });
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const now = new Date("2026-08-24T02:00:00Z");
    await db
      .collection("aiUsage")
      .doc(CHAT_USAGE_DOC(STUDENT_UID, "2026-08-24"))
      .set({ uid: STUDENT_UID, feature: "chat", date: "2026-08-24", count: 1, updatedAt: now });

    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);
    await expect(
      runSendChatMessage(
        AUTH_OK,
        { sessionId: SESSION_ID, text: "Em thấy tuyệt vọng quá" },
        makeDeps({ now, callChatCompletion: fake }),
      ),
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(fake).not.toHaveBeenCalled();

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1);
    expect(alerts.docs[0].data()).toMatchObject({ severity: "concern", triggeredBy: "keyword" });
  });

  it("7i. Lớp 1 concern đã ghi cảnh báo → LỖI PROVIDER ngay sau đó → cảnh báo VẪN tồn tại", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const fake = vi.fn(async () => {
      throw new AiProviderError("server", "AI provider trả về lỗi.");
    });

    await expect(
      runSendChatMessage(
        AUTH_OK,
        { sessionId: SESSION_ID, text: "Em thấy tuyệt vọng quá" },
        makeDeps({ callChatCompletion: fake }),
      ),
    ).rejects.toMatchObject({ code: "internal" });

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1);
    expect(alerts.docs[0].data()).toMatchObject({ severity: "concern", triggeredBy: "keyword" });
  });

  it("7j. Lớp 1 concern đã ghi cảnh báo → phản hồi model bị LỌC AN TOÀN chặn ngay sau đó → cảnh báo VẪN tồn tại (đây chính là ca review đã chỉ ra: trước fix, crisisAlerts RỖNG còn aiSafetyLog thì có)", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const unsafeText = ["Có vẻ như bạn đang bị trầm cảm.", "", `${CONCERN_LEVEL_LABEL} none`].join("\n");
    const fake = fakeCallChatCompletion(unsafeText);

    await expect(
      runSendChatMessage(
        AUTH_OK,
        { sessionId: SESSION_ID, text: "Em thấy tuyệt vọng quá" },
        makeDeps({ callChatCompletion: fake }),
      ),
    ).rejects.toMatchObject({ code: "internal" });

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1);
    expect(alerts.docs[0].data()).toMatchObject({ severity: "concern", triggeredBy: "keyword" });

    const safetyLogs = await db.collection("aiSafetyLog").get();
    expect(safetyLogs.size).toBe(1);
  });

  // ==== Fix round 3, Finding 2 — dedup query phải fail-open, không được làm hỏng phản hồi khủng hoảng ====
  it("7k. Truy vấn chống-lụt LỖI (vd. index chưa build) → FAIL OPEN: học sinh VẪN nhận CRISIS_REPLY_TEXT, cảnh báo VẪN được tạo", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);
    const brokenDb = makeDbWithRejectingCrisisAlertsQuery(db);

    const result = await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em muốn tự tử" },
      makeDeps({ db: brokenDb, callChatCompletion: fake }),
    );

    expect(result.messageId).toBeTruthy();
    expect(fake).not.toHaveBeenCalled(); // vẫn là nhánh Lớp 1 urgent, không gọi model

    // Đọc lại bằng `db` THẬT (không phải brokenDb) để xác nhận trạng thái cuối cùng.
    const messages = await getSessionMessagesAsc(SESSION_ID);
    expect(messages[1]).toMatchObject({ text: CRISIS_REPLY_TEXT, isCrisisResponse: true });

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1);
    expect(alerts.docs[0].data()).toMatchObject({ severity: "urgent", triggeredBy: "keyword" });
  });

  it("8. killSwitch.chat = true → failed-precondition, callChatCompletion KHÔNG được gọi (moodReflection có thể vẫn bật)", async () => {
    await setAiConfig({ killSwitch: { moodReflection: false, chat: true } });
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

  it("9. aiConfig.baseUrl rỗng (chưa cấu hình) → failed-precondition, không gọi mạng", async () => {
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

  it("10. hết quota NGÀY → resource-exhausted (thông điệp 'hết lượt hôm nay'), không gọi mạng", async () => {
    await setAiConfig({ chatQuotaPerDay: 1 });
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const now = new Date("2026-08-24T02:00:00Z");
    // Đã dùng hết lượt duy nhất trong ngày trước khi gọi.
    await db
      .collection("aiUsage")
      .doc(CHAT_USAGE_DOC(STUDENT_UID, "2026-08-24"))
      .set({ uid: STUDENT_UID, feature: "chat", date: "2026-08-24", count: 1, updatedAt: now });
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);

    let caught: unknown;
    try {
      await runSendChatMessage(
        AUTH_OK,
        { sessionId: SESSION_ID, text: "Xin chào" },
        makeDeps({ now, callChatCompletion: fake }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "resource-exhausted" });
    expect((caught as Error).message).toMatch(/hôm nay/);
    expect(fake).not.toHaveBeenCalled();

    const messages = await getSessionMessagesAsc(SESSION_ID);
    expect(messages.length).toBe(0);
  });

  // Fix round 1, Finding 2a: rate limit RIÊNG cho chat, thông điệp RIÊNG (không lẫn với "hết
  // lượt hôm nay" — nguyên nhân khác hẳn, và ngưỡng ngày còn rất xa).
  it("10b. vượt rate limit RIÊNG của chat → resource-exhausted với thông điệp KHÁC ('gửi hơi nhanh'), không gọi mạng, không trừ quota ngày", async () => {
    await setAiConfig({ chatQuotaPerDay: 30, chatRateLimitPerMinute: 20 }); // ngưỡng 3 giây/tin
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const t1 = new Date("2026-08-24T02:00:00.000Z");
    const t2 = new Date("2026-08-24T02:00:00.500Z"); // 500ms sau — dưới ngưỡng 3000ms

    const fake1 = fakeCallChatCompletion(VALID_MODEL_TEXT);
    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Tin 1" },
      makeDeps({ now: t1, callChatCompletion: fake1 }),
    );
    expect(fake1).toHaveBeenCalledTimes(1);

    const fake2 = fakeCallChatCompletion(VALID_MODEL_TEXT);
    let caught: unknown;
    try {
      await runSendChatMessage(
        AUTH_OK,
        { sessionId: SESSION_ID, text: "Tin 2" },
        makeDeps({ now: t2, callChatCompletion: fake2 }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "resource-exhausted" });
    expect((caught as Error).message).toMatch(/nhanh/);
    expect((caught as Error).message).not.toMatch(/hôm nay/);
    expect(fake2).not.toHaveBeenCalled();

    const usageSnap = await db.collection("aiUsage").doc(CHAT_USAGE_DOC(STUDENT_UID, "2026-08-24")).get();
    expect(usageSnap.data()?.count).toBe(1); // lượt bị rate-limit không tăng count
  });

  it("11. đường thuận: ghi tin học sinh, gọi model, ghi tin trợ lý, cập nhật lastMessageAt/messageCount", async () => {
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

  it("12. Lớp 2 một mình trả nhãn urgent → MỘT alert triggeredBy=model, severity=urgent, tin trợ lý là CRISIS_REPLY_TEXT chứ không phải nội dung model sinh ra", async () => {
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
    const usageSnap = await db.collection("aiUsage").doc(CHAT_USAGE_DOC(STUDENT_UID, "2026-08-24")).get();
    expect(usageSnap.data()?.count).toBe(1);
  });

  it("12b. Lớp 2 một mình trả nhãn concern → MỘT alert triggeredBy=model, tin trợ lý VẪN là nội dung model sinh ra (đã bóc nhãn)", async () => {
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

  // Fix round 1, Finding 5 — cả hai lớp cùng phát tín hiệu trên MỘT tin nhắn.
  it("12c. Lớp 1 concern + Lớp 2 urgent → MỘT alert duy nhất triggeredBy='both', severity=urgent (mức NẶNG HƠN), tin trợ lý là CRISIS_REPLY_TEXT", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    // "tuyệt vọng" khớp Lớp 1 mức concern.
    const modelReply = ["Mình rất lo cho em.", "", `${CONCERN_LEVEL_LABEL} urgent`].join("\n");
    const fake = fakeCallChatCompletion(modelReply);

    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em thấy tuyệt vọng quá" },
      makeDeps({ callChatCompletion: fake }),
    );

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1); // KHÔNG phải 2 — một document GỘP
    expect(alerts.docs[0].data()).toMatchObject({ severity: "urgent", triggeredBy: "both" });

    const messages = await getSessionMessagesAsc(SESSION_ID);
    expect(messages[1]).toMatchObject({ role: "assistant", text: CRISIS_REPLY_TEXT, isCrisisResponse: true });
  });

  it("12d. Lớp 1 concern + Lớp 2 concern → MỘT alert duy nhất triggeredBy='both', severity=concern, tin trợ lý VẪN là nội dung model", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const modelReply = [NORMAL_REPLY_TEXT, "", `${CONCERN_LEVEL_LABEL} concern`].join("\n");
    const fake = fakeCallChatCompletion(modelReply);

    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em thấy tuyệt vọng quá" },
      makeDeps({ callChatCompletion: fake }),
    );

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1);
    expect(alerts.docs[0].data()).toMatchObject({ severity: "concern", triggeredBy: "both" });

    const messages = await getSessionMessagesAsc(SESSION_ID);
    expect(messages[1]).toMatchObject({ role: "assistant", text: NORMAL_REPLY_TEXT, isCrisisResponse: false });
  });

  it("12e. Nhãn thiếu hoàn toàn → fail-closed về concern (vẫn ghi crisisAlerts), không ném lỗi", async () => {
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

  // Fix round 1, Finding 3 — bốn hình dạng SAI ĐỊNH DẠNG mà review đã chạy tay: đều fail-closed
  // ĐÚNG như thiết kế (không đoán mò mức độ), NHƯNG đều phải bị BÓC khỏi văn bản hiển thị —
  // trước fix, dòng nhãn nguyên văn (kể cả sai định dạng) sẽ lọt tới học sinh.
  const MALFORMED_LABEL_CASES: { name: string; line: string }[] = [
    { name: "dấu chấm cuối câu", line: `${CONCERN_LEVEL_LABEL} urgent.` },
    { name: "giá trị viết hoa", line: `${CONCERN_LEVEL_LABEL} Urgent` },
    { name: "có gạch đầu dòng", line: `- ${CONCERN_LEVEL_LABEL} urgent` },
    { name: "ba dấu sao thay vì hai", line: `***${CONCERN_LEVEL_LABEL}*** urgent***` },
  ];

  it.each(MALFORMED_LABEL_CASES)(
    "12f. nhãn sai định dạng ($name) → fail-closed về concern NHƯNG vẫn bị bóc khỏi văn bản hiển thị",
    async ({ line }) => {
      await setAiConfig();
      await setUser(STUDENT_UID, true);
      await setChatSession(SESSION_ID, STUDENT_UID);
      const modelReply = ["Mình hiểu cảm giác đó.", "", line].join("\n");
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
      const assistantText = messages[1].text as string;
      expect(assistantText).not.toContain("MỨC ĐỘ LO NGẠI");
      expect(assistantText.trim()).toBe("Mình hiểu cảm giác đó.");
    },
  );

  it("12g. Nhãn có markdown bold, khoảng trắng thừa, và bị lặp lại (ĐÚNG định dạng) → tất cả các dòng nhãn đều bị bóc khỏi văn bản hiển thị", async () => {
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

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.empty).toBe(true); // nhãn cuối cùng hợp lệ là "none"
  });

  it("12h. Nhãn bị học sinh gõ biến thể khoảng trắng (2 dấu cách) trong chính output model → KHÔNG được nhận diện là nhãn thật (không bóc, không đổi mức độ), dòng cuối hợp lệ mới được dùng", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    // Dòng đầu là một biến thể khoảng trắng (2 dấu cách giữa MỨC và ĐỘ) — không khớp CẢ HAI
    // pattern (xác định mức độ lẫn bóc), vì cả hai đều đòi nguyên văn nhãn. Dòng CUỐI mới là
    // nhãn thật, hợp lệ, phải được dùng làm kết quả.
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
    // Biến thể 2 dấu cách vẫn còn nguyên trong văn bản hiển thị — KHÔNG bị bóc, vì nó không
    // phải nhãn thật (an toàn: không "giấu" nội dung không phải control token).
    expect(messages[1].text).toContain("MỨC  ĐỘ LO NGẠI");
  });

  // Fix round 3, Finding 1 — ca cụ thể review đã chỉ ra: trước fix, Lớp 1 bị dedup (gắn vào
  // cảnh báo cũ, KHÔNG tạo mới) khiến layer1AlertId là null, rồi nhánh "Lớp 1 không phát hiện
  // gì" ở dưới CŨNG bị chính dedup đó chặn khi thử tạo — không ghi gì cả, dù Lớp 2 phát hiện
  // urgent. Sau fix: layer1AlertId LUÔN là id thật (kể cả khi bị dedup), nên Lớp 2 nâng cấp
  // ĐÚNG document đã có.
  it("12i. Lớp 1 bị dedup (gắn vào cảnh báo đã có, cùng mức concern) NHƯNG Lớp 2 phát hiện urgent → cảnh báo ĐÃ CÓ được nâng cấp lên urgent/both (trước fix: không ghi gì cả)", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const t1 = new Date("2026-08-24T02:00:00Z");

    // Tin đầu: Lớp 1 concern, tạo cảnh báo concern/keyword.
    const fake1 = fakeCallChatCompletion(VALID_MODEL_TEXT);
    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em thấy tuyệt vọng quá" },
      makeDeps({ now: t1, callChatCompletion: fake1 }),
    );
    const alertsAfterFirst = await db.collection("crisisAlerts").get();
    expect(alertsAfterFirst.size).toBe(1);
    expect(alertsAfterFirst.docs[0].data().severity).toBe("concern");

    // Tin hai, trong cửa sổ chống-lụt: CŨNG Lớp 1 concern (bị dedup, gắn vào cảnh báo cũ, không
    // tạo mới vì cùng mức) NHƯNG model tự chấm urgent (Lớp 2).
    const t2 = new Date(t1.getTime() + 60_000);
    const modelReply = ["Mình rất lo cho em.", "", `${CONCERN_LEVEL_LABEL} urgent`].join("\n");
    const fake2 = fakeCallChatCompletion(modelReply);
    await runSendChatMessage(
      AUTH_OK,
      { sessionId: SESSION_ID, text: "Em vẫn thấy tuyệt vọng" },
      makeDeps({ now: t2, callChatCompletion: fake2 }),
    );

    const alerts = await db.collection("crisisAlerts").get();
    expect(alerts.size).toBe(1); // vẫn CHỈ một document
    expect(alerts.docs[0].id).toBe(alertsAfterFirst.docs[0].id); // cùng document đã có
    expect(alerts.docs[0].data()).toMatchObject({ severity: "urgent", triggeredBy: "both" });

    const messages = await getSessionMessagesAsc(SESSION_ID);
    expect(messages[3]).toMatchObject({ role: "assistant", text: CRISIS_REPLY_TEXT, isCrisisResponse: true });
  });

  it("13. checkOutputSafety báo không an toàn → không ghi tin trợ lý, ghi aiSafetyLog (promptTemplateId='default_chat'), ném internal với thông điệp trung tính", async () => {
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
    expect(logData.promptTemplateId).toBe("default_chat");
    expect(logData.model).toBe("fake-model-v1");
    expect(logData.triggeredKeyword).toContain("trầm cảm");
    expect(JSON.stringify(logData)).not.toContain(STUDENT_UID);
  });

  it("14. lỗi provider → internal, không lộ baseUrl, model, hay nguyên văn lỗi provider", async () => {
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

  it("14b. lỗi provider → aiUsage VẪN bị trừ (request đã đi ra ngoài)", async () => {
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

    const usageSnap = await db.collection("aiUsage").doc(CHAT_USAGE_DOC(STUDENT_UID, "2026-08-24")).get();
    expect(usageSnap.exists).toBe(true);
    expect(usageSnap.data()?.count).toBe(1);
  });

  it("15. crisisAlerts được ghi KHÔNG có field nào chứa nguyên văn — Object.keys() đúng bằng danh sách cho phép", async () => {
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

  // Fix round 1, Finding 8: chuỗi CHỈ TOÀN khoảng trắng có length >= 1 (qua được .min(1)) —
  // phải bị chặn RIÊNG, không được đi tới provider.
  it("16. text chỉ chứa khoảng trắng → invalid-argument, không gọi mạng", async () => {
    await setAiConfig();
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const fake = fakeCallChatCompletion(VALID_MODEL_TEXT);

    await expect(
      runSendChatMessage(
        AUTH_OK,
        { sessionId: SESSION_ID, text: "    " },
        makeDeps({ callChatCompletion: fake }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(fake).not.toHaveBeenCalled();
  });

  it("17. quota chỉ bị trừ khi thật sự phát ra request tới provider — killSwitch.chat bật → aiUsage không đổi", async () => {
    await setAiConfig({ killSwitch: { moodReflection: false, chat: true } });
    await setUser(STUDENT_UID, true);
    await setChatSession(SESSION_ID, STUDENT_UID);
    const now = new Date("2026-08-24T02:00:00Z");

    await expect(
      runSendChatMessage(AUTH_OK, { sessionId: SESSION_ID, text: "Xin chào" }, makeDeps({ now })),
    ).rejects.toMatchObject({ code: "failed-precondition" });

    const usageSnap = await db.collection("aiUsage").doc(CHAT_USAGE_DOC(STUDENT_UID, "2026-08-24")).get();
    expect(usageSnap.exists).toBe(false);
  });

  it("17b. sessionId không tồn tại → aiUsage không đổi (quota đứng sau not-found)", async () => {
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

    const usageSnap = await db.collection("aiUsage").doc(CHAT_USAGE_DOC(STUDENT_UID, "2026-08-24")).get();
    expect(usageSnap.exists).toBe(false);
  });
});

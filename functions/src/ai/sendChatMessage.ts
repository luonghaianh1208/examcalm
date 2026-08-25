// Callable ráp năm module thuần (openaiClient, crisisDetector, buildChatPrompt, safetyFilter,
// quota) thành một luồng có bảo vệ. Bản thân file này CỐ Ý mỏng — không logic nghiệp vụ mới
// ngoài phần bóc nhãn lo ngại của Lớp 2 (xem parseConcernLevel bên dưới, thuộc về callable này
// theo đúng phân công của task-5-brief.md, không phải một module thuần Task 3/4). Mọi quyết
// định khác (dựng prompt, gọi model, phát hiện từ khoá, lọc an toàn, tính quota) đã nằm trong
// các module con.
//
// Ráp theo cùng khuôn với generateReflection.ts (Spec #3): cùng region, cùng cách đọc secret
// qua defineSecret, cùng kỷ luật thứ tự guard, cùng cách xử lý lỗi đã khử thông tin nhạy cảm.
//
// Thứ tự guard BẮT BUỘC (task-5-brief.md — rẻ/nhạy cảm trước, tốn tiền sau):
// chưa đăng nhập → email chưa xác thực → input parse → kill switch → baseUrl rỗng → aiOptIn
// tắt → session không tồn tại → session không sở hữu → LỚP 1 (từ khoá) → quota → gọi provider.
//
// Lớp 1 đứng TRÊN quota có chủ đích: một tin nhắn "urgent" không bao giờ được từ chối vì lý do
// quota (design spec §3.1, §6) — nhánh "urgent" trả thẳng CRISIS_REPLY_TEXT, không gọi model,
// không trừ quota. Nhánh "concern" ghi cảnh báo rồi ĐI TIẾP vào luồng bình thường (gọi model,
// dùng phản hồi của nó) — sửa ngày 2026-08-25 của design spec §3.1: chỉ "urgent" mới chặn lời
// gọi model, một học sinh tuyệt vọng nhưng chưa nêu ý định có lợi từ một cuộc trò chuyện thật.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { aiConfigSchema, DEFAULT_AI_CONFIG, type AiConfig } from "./config";
import {
  callChatCompletion as callChatCompletionDefault,
  AiProviderError,
  type ChatCompletionResult,
} from "./openaiClient";
import {
  buildChatMessages,
  CRISIS_REPLY_TEXT,
  CONCERN_LEVEL_LABEL,
  CONCERN_LEVEL_VALUES,
  CHAT_MESSAGE_MAX_CHARS,
  CHAT_WINDOW_SIZE,
  type ChatTurnPromptInput,
} from "./buildChatPrompt";
import { detectCrisisKeywords } from "./crisisDetector";
import { checkOutputSafety } from "./safetyFilter";
import { consumeQuota } from "./quota";

/** Secret chứa API key của AI provider — KHÔNG BAO GIỜ đọc từ process.env trực tiếp. Khai
 *  báo trong `secrets: [...]` của onCall để Cloud Functions bơm giá trị vào runtime. */
const aiApiKeySecret = defineSecret("EXAMCALM_AI_API_KEY");

/** Timeout cho một lượt gọi model — cùng giá trị với generateReflection.ts. */
const AI_REQUEST_TIMEOUT_MS = 30_000;

/** Sentinel dùng khi chưa có promptTemplates nào cho chat — Task 5 CỐ Ý không dựng cơ chế đọc
 *  promptTemplates riêng cho chat (không có task nào trong plan giao việc đó; DEFAULT_CHAT_TEMPLATE
 *  của buildChatPrompt.ts đã là tham số mặc định của buildChatMessages). Sentinel này chỉ dùng để
 *  điền field `promptTemplateId` của aiSafetyLog cho đúng hình dạng đã quy ước ở generateReflection.ts. */
const DEFAULT_PROMPT_TEMPLATE_ID = "default";

const inputSchema = z.object({
  sessionId: z.string().min(1),
  text: z.string().min(1).max(CHAT_MESSAGE_MAX_CHARS),
});

/** Thông điệp lỗi trả về client cho MỌI lỗi phát sinh sau khi đã gọi (hoặc thử gọi) model —
 *  cùng lý do với GENERIC_MODEL_FAILURE_MESSAGE của generateReflection.ts: không tiết lộ
 *  baseUrl, model, API key, hay lý do nội bộ nào cho học sinh. */
const GENERIC_MODEL_FAILURE_MESSAGE = "Không thể trả lời lúc này, thử lại sau nhé.";

export type SendChatMessageCallerAuth = { uid: string; emailVerified: boolean } | undefined;

export type SendChatMessageDeps = {
  db: Firestore;
  /** Mốc thời gian dùng cho quota — nhận qua tham số (không gọi `new Date()` trong hàm) để
   *  test kiểm soát được khoá ngày giờ VN một cách xác định. */
  now: Date;
  apiKey: string;
  callChatCompletion: (
    ...args: Parameters<typeof callChatCompletionDefault>
  ) => Promise<ChatCompletionResult>;
};

export type SendChatMessageResult = { messageId: string };

/** Đọc `systemConfig/aiConfig`. Cùng hành vi với loadAiConfig của generateReflection.ts — doc
 *  thiếu hoặc sai hình dạng đều coi như "chưa cấu hình" (an toàn cho học sinh), nhưng log lại
 *  ĐƯỜNG DẪN field sai (không phải giá trị) để admin biết vì sao tính năng "tự nhiên" tắt. */
async function loadAiConfig(db: Firestore): Promise<AiConfig> {
  const snap = await db.collection("systemConfig").doc("aiConfig").get();
  if (!snap.exists) return DEFAULT_AI_CONFIG;

  const parsed = aiConfigSchema.safeParse(snap.data());
  if (!parsed.success) {
    console.error("systemConfig/aiConfig không hợp lệ, dùng cấu hình mặc định (an toàn)", {
      paths: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
    return DEFAULT_AI_CONFIG;
  }
  return parsed.data;
}

type NewChatMessage = {
  userId: string;
  sessionId: string;
  role: "user" | "assistant";
  text: string;
  isCrisisResponse: boolean;
};

/** Ghi một tin nhắn mới vào `chatMessages` VÀ cập nhật `lastMessageAt`/`messageCount` của
 *  `chatSessions` cha trong cùng một lượt gọi — mọi tin (của học sinh hay của trợ lý) đều đi
 *  qua đúng một điểm này, để hai collection không bao giờ lệch nhau (design spec §4). */
async function appendChatMessage(
  db: Firestore,
  sessionId: string,
  message: NewChatMessage,
): Promise<string> {
  const ref = await db.collection("chatMessages").add({
    ...message,
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.collection("chatSessions").doc(sessionId).update({
    lastMessageAt: FieldValue.serverTimestamp(),
    messageCount: FieldValue.increment(1),
  });
  return ref.id;
}

/** Ghi một cảnh báo khủng hoảng — CHỈ đúng sáu field cho phép (design spec §3.4, non-negotiable
 *  của task-5-brief.md): không bao giờ messageText, trích đoạn, hay tóm tắt nào lọt vào đây. */
async function writeCrisisAlert(
  db: Firestore,
  userId: string,
  severity: "urgent" | "concern",
  triggeredBy: "keyword" | "model",
): Promise<void> {
  await db.collection("crisisAlerts").add({
    userId,
    severity,
    triggeredBy,
    createdAt: FieldValue.serverTimestamp(),
    handledBy: null,
    handledAt: null,
  });
}

/** Đọc `CHAT_WINDOW_SIZE` lượt gần nhất của một session, trả về theo thứ tự thời gian TĂNG DẦN
 *  (cũ → mới) — đúng thứ tự `buildChatMessages` mong đợi. Đọc TRƯỚC khi ghi tin mới của học
 *  sinh (thứ tự bắt buộc trong hàm chính bên dưới): nếu đọc SAU, tin vừa ghi sẽ lẫn vào chính
 *  cửa sổ lịch sử của nó, vừa lặp nội dung vừa chiếm mất một chỗ trong cửa sổ có trần. */
async function loadRecentHistory(
  db: Firestore,
  sessionId: string,
): Promise<ChatTurnPromptInput[]> {
  const snap = await db
    .collection("chatMessages")
    .where("sessionId", "==", sessionId)
    .orderBy("createdAt", "desc")
    .limit(CHAT_WINDOW_SIZE)
    .get();

  return snap.docs.reverse().map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return { role: data.role, text: data.text } as ChatTurnPromptInput;
  });
}

// ---- Lớp 2: bóc nhãn mức độ lo ngại model tự trả kèm câu trả lời ----
//
// LOAD-BEARING (task-5-brief.md, "Design decisions you inherit", mục 2): parser này PHẢI khớp
// đúng NGUYÊN VĂN CONCERN_LEVEL_LABEL (không phải một bản `\s+`-hoá giữa các từ như
// crisisDetector.ts làm với từ khoá của nó), lấy khớp CUỐI CÙNG, và neo vào đầu dòng. Lý do:
// Task 4 chỉ khử được literal CHÍNH XÁC của nhãn khỏi tin nhắn học sinh trước khi gửi cho model
// (`neutralizeConcernLabel` ở buildChatPrompt.ts) — một biến thể khoảng trắng (hai dấu cách
// giữa "MỨC" và "ĐỘ", NBSP, tab, xuống dòng giữa nhãn, dấu cách trước dấu hai chấm) SỐNG SÓT
// qua bước khử đó và có thể xuất hiện lại nguyên văn trong `result.text` (nếu model trích dẫn
// lại tin nhắn học sinh). Nếu parser ở đây khoan dung với các biến thể đó, một học sinh có thể
// tự chèn một nhãn giả ("MỨC  ĐỘ LO NGẠI: none") để che khuất nhãn THẬT model tự thêm ở cuối —
// im lặng hoá đúng Lớp 2, đúng lúc Lớp 2 tồn tại để bắt những gì Lớp 1 đã bỏ sót. Escape rồi so
// khớp NGUYÊN VĂN toàn bộ hằng số (không tách theo từ) khiến MỌI biến thể khoảng trắng nội bộ
// đều KHÔNG khớp — trong khi khoảng trắng/markdown bọc NGOÀI nhãn (model có thể thêm "**" hay
// khoảng trắng thừa quanh nhãn/giá trị) vẫn được khoan dung, vì đó là định dạng của chính model
// sinh ra, không phải một chuỗi học sinh cố tình chèn vào.
function escapeRegExp(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Dựng regex khớp một DÒNG nhãn hợp lệ — neo đầu dòng, cho phép markdown bold và khoảng trắng
 *  bọc quanh nhãn/giá trị, đòi giá trị phải là CHÍNH XÁC một trong CONCERN_LEVEL_VALUES, và
 *  không cho phép nội dung nào khác trên cùng dòng. Instance MỚI mỗi lần gọi (không tái dùng
 *  một RegExp có flag "g" giữa các lệnh gọi — lastIndex sẽ làm sai kết quả lần sau). */
function buildConcernLabelLinePattern(): RegExp {
  const label = escapeRegExp(CONCERN_LEVEL_LABEL);
  const values = CONCERN_LEVEL_VALUES.join("|");
  return new RegExp(`^[ \\t]*\\*{0,2}${label}\\*{0,2}[ \\t]*(${values})[ \\t]*\\*{0,2}[ \\t]*$`, "gm");
}

type ConcernLevel = (typeof CONCERN_LEVEL_VALUES)[number];

type ParsedConcernLevel = {
  /** null = không tìm thấy dòng nhãn hợp lệ nào (thiếu, hoặc mọi ứng viên đều sai định dạng) —
   *  caller PHẢI fail-closed về "concern" (mục 3, task-5-brief.md), không được coi là "none". */
  level: ConcernLevel | null;
  /** Văn bản đã loại bỏ MỌI dòng khớp nhãn hợp lệ (kể cả bị lặp lại nhiều lần) — an toàn để
   *  hiển thị thẳng cho học sinh (mục 4, task-5-brief.md). */
  strippedText: string;
};

function parseConcernLevel(rawText: string): ParsedConcernLevel {
  const normalized = rawText.normalize("NFC");
  const matches = Array.from(normalized.matchAll(buildConcernLabelLinePattern()));
  const strippedText = normalized.replace(buildConcernLabelLinePattern(), "").trim();

  if (matches.length === 0) {
    return { level: null, strippedText };
  }

  // Lấy khớp CUỐI CÙNG: nếu văn bản có nhiều dòng nhãn hợp lệ (model lặp lại, hoặc một dòng
  // sớm hơn tình cờ khớp), dòng model thực sự dùng để kết thúc câu trả lời (theo đúng chỉ dẫn
  // "Ở CUỐI câu trả lời" trong system prompt) mới là kết quả đáng tin.
  const lastMatch = matches[matches.length - 1];
  return { level: lastMatch[1] as ConcernLevel, strippedText };
}

/**
 * Lõi có thể test được của callable — nhận auth/data/deps đã bóc tách sẵn, không phụ thuộc
 * runtime thật của Cloud Functions. Ném HttpsError trực tiếp để test gọi thẳng hàm này với
 * Firestore emulator và một callChatCompletion giả.
 */
export async function runSendChatMessage(
  auth: SendChatMessageCallerAuth,
  data: unknown,
  deps: SendChatMessageDeps,
): Promise<SendChatMessageResult> {
  // 1. Chưa đăng nhập.
  if (!auth) {
    throw new HttpsError("unauthenticated", "Bạn cần đăng nhập để dùng tính năng này.");
  }

  // 2. Email chưa xác thực.
  if (!auth.emailVerified) {
    throw new HttpsError(
      "permission-denied",
      "Bạn cần xác thực email trước khi dùng tính năng này.",
      { reason: "email_unverified" },
    );
  }

  const parsedInput = inputSchema.safeParse(data);
  if (!parsedInput.success) {
    throw new HttpsError("invalid-argument", "Thiếu sessionId hoặc nội dung tin nhắn hợp lệ.");
  }
  const { sessionId, text } = parsedInput.data;

  const config = await loadAiConfig(deps.db);

  // 3. Kill switch — kiểm tra RẺ nhất, đứng đầu.
  if (config.killSwitch.moodReflection) {
    throw new HttpsError("failed-precondition", "Tính năng trò chuyện AI hiện đang tắt.");
  }

  // 4. baseUrl chưa cấu hình — trạng thái mặc định của hệ thống là im lặng.
  if (config.baseUrl === "") {
    throw new HttpsError("failed-precondition", "Tính năng trò chuyện AI chưa sẵn sàng.");
  }

  // 5. aiOptIn — lời hứa riêng tư cốt lõi, phải chặn trước khi tốn bất kỳ chi phí nào.
  const userSnap = await deps.db.collection("users").doc(auth.uid).get();
  const aiOptIn = userSnap.exists && userSnap.data()?.privacySettings?.aiOptIn === true;
  if (!aiOptIn) {
    throw new HttpsError(
      "permission-denied",
      "Bạn cần bật đồng ý dùng tính năng AI trong phần cài đặt riêng tư trước.",
      { reason: "ai_opt_in" },
    );
  }

  // 6/7. session phải tồn tại VÀ thuộc về đúng người gọi — callable chạy bằng Admin SDK nên
  // Security Rules không bảo vệ, phải tự so sánh userId.
  const sessionRef = deps.db.collection("chatSessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError("not-found", "Không tìm thấy phiên trò chuyện này.");
  }
  const sessionData = sessionSnap.data() as Record<string, unknown>;
  if (sessionData.userId !== auth.uid) {
    // CỐ Ý không kèm `details` — cùng lý do với generateReflection.ts: một discriminator riêng
    // cho nhánh này sẽ xác nhận document TỒN TẠI và thuộc về người khác.
    throw new HttpsError("permission-denied", "Bạn không có quyền truy cập phiên trò chuyện này.");
  }

  // 8. Lớp 1 — từ khoá, chạy TRƯỚC quota có chủ đích (design spec §3.1: một tin "urgent" không
  // bao giờ được từ chối vì lý do quota).
  const layer1 = detectCrisisKeywords(text);
  if (layer1.severity === "urgent") {
    await writeCrisisAlert(deps.db, auth.uid, "urgent", "keyword");
    await appendChatMessage(deps.db, sessionId, {
      userId: auth.uid,
      sessionId,
      role: "user",
      text,
      isCrisisResponse: false,
    });
    const assistantMessageId = await appendChatMessage(deps.db, sessionId, {
      userId: auth.uid,
      sessionId,
      role: "assistant",
      text: CRISIS_REPLY_TEXT,
      isCrisisResponse: true,
    });
    return { messageId: assistantMessageId };
  }
  if (layer1.severity === "concern") {
    // Ghi cảnh báo NHƯNG đi tiếp vào luồng bình thường — không return ở đây.
    await writeCrisisAlert(deps.db, auth.uid, "concern", "keyword");
  }

  // 9. Quota — đứng NGAY TRƯỚC callChatCompletion, chỗ duy nhất còn lại có thể tốn tiền thật.
  const quota = await consumeQuota(
    deps.db,
    auth.uid,
    { quotaStudentPerDay: config.chatQuotaPerDay, rateLimitPerMinute: config.rateLimitPerMinute },
    deps.now,
  );
  if (!quota.allowed) {
    throw new HttpsError(
      "resource-exhausted",
      "Bạn đã dùng hết lượt trò chuyện AI hôm nay, thử lại sau nhé.",
    );
  }

  // Đọc lịch sử TRƯỚC khi ghi tin mới của học sinh — nếu đọc sau, tin vừa ghi sẽ lẫn vào chính
  // cửa sổ lịch sử của nó (xem comment của loadRecentHistory).
  const history = await loadRecentHistory(deps.db, sessionId);

  await appendChatMessage(deps.db, sessionId, {
    userId: auth.uid,
    sessionId,
    role: "user",
    text,
    isCrisisResponse: false,
  });

  const messages = buildChatMessages(history, text);

  let result: ChatCompletionResult;
  try {
    result = await deps.callChatCompletion({
      baseUrl: config.baseUrl,
      apiKey: deps.apiKey,
      model: config.model,
      messages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof AiProviderError) {
      // KHÔNG đưa error.message (có thể chứa status code, gợi ý baseUrl) vào lỗi trả về
      // client — chỉ log nội bộ `kind`, không log uid (cùng lý do generateReflection.ts).
      console.error("sendChatMessage: callChatCompletion thất bại", { kind: error.kind });
      throw new HttpsError("internal", GENERIC_MODEL_FAILURE_MESSAGE);
    }
    throw error;
  }

  // Lọc an toàn chạy trên TOÀN BỘ văn bản thô, TRƯỚC khi bóc nhãn Lớp 2 — model có thể chèn
  // ngôn ngữ chẩn đoán ở phần mở đầu, và nhãn mức độ lo ngại không trùng bất kỳ từ cấm nào
  // (đã kiểm tra thủ công ở buildChatPrompt.ts) nên không tự kích hoạt bộ lọc.
  const safety = checkOutputSafety(result.text);
  if (!safety.safe) {
    await deps.db.collection("aiSafetyLog").add({
      triggeredKeyword: safety.keyword ?? "(không xác định — văn bản rỗng)",
      model: config.model,
      promptTemplateId: DEFAULT_PROMPT_TEMPLATE_ID,
      createdAt: FieldValue.serverTimestamp(),
    });
    throw new HttpsError("internal", GENERIC_MODEL_FAILURE_MESSAGE);
  }

  // Lớp 2 — model tự đánh giá. Chỉ "urgent" mới ghi đè bằng CRISIS_REPLY_TEXT (đối xứng với
  // Lớp 1: chỉ urgent mới dừng vai bạn tâm sự). "concern" — kể cả fail-closed do nhãn thiếu/sai
  // định dạng (mục 3, task-5-brief.md) — vẫn ghi cảnh báo nhưng dùng thẳng câu trả lời thật của
  // model, đã bóc nhãn khỏi phần hiển thị cho học sinh.
  const parsedConcern = parseConcernLevel(result.text);

  let assistantText: string;
  let isCrisisResponse: boolean;

  if (parsedConcern.level === "urgent") {
    await writeCrisisAlert(deps.db, auth.uid, "urgent", "model");
    assistantText = CRISIS_REPLY_TEXT;
    isCrisisResponse = true;
  } else {
    if (parsedConcern.level === "concern" || parsedConcern.level === null) {
      await writeCrisisAlert(deps.db, auth.uid, "concern", "model");
    }
    if (parsedConcern.strippedText === "") {
      // Cùng triết lý "không đoán mò" của parseReflectionOutput: một câu trả lời rỗng sau khi
      // bóc nhãn (model chỉ trả đúng dòng nhãn, không có nội dung nào khác) không đáng tin để
      // hiển thị hay lưu — coi như output hỏng.
      throw new HttpsError("internal", GENERIC_MODEL_FAILURE_MESSAGE);
    }
    assistantText = parsedConcern.strippedText;
    isCrisisResponse = false;
  }

  const assistantMessageId = await appendChatMessage(deps.db, sessionId, {
    userId: auth.uid,
    sessionId,
    role: "assistant",
    text: assistantText,
    isCrisisResponse,
  });

  return { messageId: assistantMessageId };
}

export const sendChatMessage = onCall(
  { region: "asia-southeast1", secrets: [aiApiKeySecret] },
  async (request) => {
    const auth = request.auth
      ? { uid: request.auth.uid, emailVerified: request.auth.token.email_verified === true }
      : undefined;

    return runSendChatMessage(auth, request.data, {
      db: getFirestore(),
      now: new Date(),
      apiKey: aiApiKeySecret.value(),
      callChatCompletion: callChatCompletionDefault,
    });
  },
);

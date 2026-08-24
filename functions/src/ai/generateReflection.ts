// Callable ráp năm module thuần (Task 3-7) thành một luồng có bảo vệ. Bản thân file này
// CỐ Ý mỏng — không logic nghiệp vụ mới, chỉ thứ tự gọi và glue. Mọi quyết định (parse
// prompt, gọi model, tách output, lọc an toàn, tính quota) đã nằm trong các module con.
//
// Kiểm tra theo ĐÚNG thứ tự bắt buộc (xem task-8-brief.md): rẻ/nhạy cảm trước, tốn tiền
// sau. Kill switch, baseUrl chưa cấu hình, và aiOptIn PHẢI bị chặn trước khi quota bị trừ
// hay callChatCompletion được gọi.

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
import { buildMoodPrompt, DEFAULT_MOOD_TEMPLATE, type MoodPromptTemplate } from "./buildPrompt";
import { parseReflectionOutput } from "./parseOutput";
import { checkOutputSafety } from "./safetyFilter";
import { consumeQuota } from "./quota";

/** Secret chứa API key của AI provider — KHÔNG BAO GIỜ đọc từ process.env trực tiếp. Khai
 *  báo trong `secrets: [...]` của onCall để Cloud Functions bơm giá trị vào runtime. */
const aiApiKeySecret = defineSecret("EXAMCALM_AI_API_KEY");

/** Timeout cho một lượt gọi model — đủ ngắn để không treo callable (onCall v2 mặc định
 *  timeout 60s), đủ dài cho model chậm hơn (self-host qua Ollama). */
const AI_REQUEST_TIMEOUT_MS = 30_000;

/** Sentinel dùng khi `promptTemplates` chưa có bản nào được publish — tính năng phải chạy
 *  được trước khi admin soạn bất kỳ prompt nào (xem DEFAULT_MOOD_TEMPLATE ở buildPrompt.ts). */
const DEFAULT_PROMPT_TEMPLATE_ID = "default";
const DEFAULT_PROMPT_TEMPLATE_VERSION = 1;

const inputSchema = z.object({ moodLogId: z.string().min(1) });

/** Thông điệp lỗi trả về client cho MỌI lỗi phát sinh sau khi đã gọi (hoặc thử gọi) model —
 *  cố tình dùng chung một câu trung tính cho cả ba trường hợp (lỗi provider, output không an
 *  toàn, output không tách được) để không tiết lộ baseUrl, model, API key, hay lý do nội bộ
 *  nào cho học sinh. */
const GENERIC_MODEL_FAILURE_MESSAGE = "Không thể tạo phản chiếu lúc này, thử lại sau nhé.";

export type GenerateReflectionCallerAuth = { uid: string; emailVerified: boolean } | undefined;

export type GenerateReflectionDeps = {
  db: Firestore;
  /** Mốc thời gian dùng cho quota — nhận qua tham số (không gọi `new Date()` trong hàm) để
   *  test kiểm soát được khoá ngày giờ VN và khoảng cách rate limit một cách xác định. */
  now: Date;
  apiKey: string;
  callChatCompletion: (
    ...args: Parameters<typeof callChatCompletionDefault>
  ) => Promise<ChatCompletionResult>;
};

/** Đọc `systemConfig/aiConfig`. Doc thiếu hoặc sai hình dạng đều coi như "chưa cấu hình" —
 *  DEFAULT_AI_CONFIG có killSwitch bật và baseUrl rỗng, nên rơi vào nhánh an toàn (im lặng)
 *  thay vì để lộ lỗi parse cấu hình ra ngoài. */
async function loadAiConfig(db: Firestore): Promise<AiConfig> {
  const snap = await db.collection("systemConfig").doc("aiConfig").get();
  if (!snap.exists) return DEFAULT_AI_CONFIG;

  const parsed = aiConfigSchema.safeParse(snap.data());
  return parsed.success ? parsed.data : DEFAULT_AI_CONFIG;
}

/** Đọc `promptTemplates` tìm bản `name == "mood_reflection"` và `status == "published"`.
 *  Không có bản nào → fallback DEFAULT_MOOD_TEMPLATE (tính năng phải chạy được trước khi
 *  admin soạn prompt). */
async function loadPromptTemplate(
  db: Firestore,
): Promise<{ template: MoodPromptTemplate; promptTemplateId: string; promptVersion: number }> {
  const snap = await db
    .collection("promptTemplates")
    .where("name", "==", "mood_reflection")
    .where("status", "==", "published")
    .limit(1)
    .get();

  if (snap.empty) {
    return {
      template: DEFAULT_MOOD_TEMPLATE,
      promptTemplateId: DEFAULT_PROMPT_TEMPLATE_ID,
      promptVersion: DEFAULT_PROMPT_TEMPLATE_VERSION,
    };
  }

  const doc = snap.docs[0];
  const data = doc.data();
  return {
    template: {
      systemPrompt: String(data.systemPrompt ?? ""),
      userTemplate: String(data.userTemplate ?? ""),
    },
    promptTemplateId: doc.id,
    promptVersion: typeof data.version === "number" ? data.version : DEFAULT_PROMPT_TEMPLATE_VERSION,
  };
}

/** Trích từ khoá bị chặn từ `reason` của checkOutputSafety để ghi vào aiSafetyLog. `reason`
 *  luôn có dạng `Phát hiện từ khoá chẩn đoán bị cấm: "<keyword>".`, trong đó `<keyword>` chỉ
 *  có thể là một trong các mục của BANNED_DIAGNOSTIC_KEYWORDS (hằng số cấu hình sẵn) —
 *  KHÔNG BAO GIỜ là một đoạn trích của output thật. Trường hợp không có dấu ngoặc kép (nhánh
 *  văn bản rỗng của checkOutputSafety) dùng sentinel cố định thay vì null/rỗng. */
function extractTriggeredKeyword(reason: string | null): string {
  const match = reason?.match(/"([^"]+)"/);
  return match ? match[1] : "(không xác định — văn bản rỗng)";
}

/**
 * Lõi có thể test được của callable — nhận auth/data/deps đã bóc tách sẵn, không phụ thuộc
 * runtime thật của Cloud Functions. Ném HttpsError trực tiếp (không cần onCall bọc quanh)
 * để test gọi thẳng hàm này với Firestore emulator và một callChatCompletion giả.
 */
export async function runGenerateReflection(
  auth: GenerateReflectionCallerAuth,
  data: unknown,
  deps: GenerateReflectionDeps,
): Promise<{ outputId: string }> {
  // 1. Chưa đăng nhập.
  if (!auth) {
    throw new HttpsError("unauthenticated", "Bạn cần đăng nhập để dùng tính năng này.");
  }

  // 2. Email chưa xác thực.
  if (!auth.emailVerified) {
    throw new HttpsError("permission-denied", "Bạn cần xác thực email trước khi dùng tính năng này.");
  }

  const parsedInput = inputSchema.safeParse(data);
  if (!parsedInput.success) {
    throw new HttpsError("invalid-argument", "Thiếu moodLogId hợp lệ.");
  }
  const { moodLogId } = parsedInput.data;

  const config = await loadAiConfig(deps.db);

  // 3. Kill switch — kiểm tra RẺ nhất, đứng đầu.
  if (config.killSwitch.moodReflection) {
    throw new HttpsError("failed-precondition", "Tính năng phản chiếu AI hiện đang tắt.");
  }

  // 4. baseUrl chưa cấu hình — trạng thái mặc định của hệ thống là im lặng.
  if (config.baseUrl === "") {
    throw new HttpsError("failed-precondition", "Tính năng phản chiếu AI chưa sẵn sàng.");
  }

  // 5. aiOptIn — lời hứa riêng tư cốt lõi, phải chặn trước khi tốn bất kỳ chi phí nào.
  const userSnap = await deps.db.collection("users").doc(auth.uid).get();
  const aiOptIn = userSnap.exists && userSnap.data()?.privacySettings?.aiOptIn === true;
  if (!aiOptIn) {
    throw new HttpsError(
      "permission-denied",
      "Bạn cần bật đồng ý dùng tính năng AI trong phần cài đặt riêng tư trước.",
    );
  }

  // 6. Quota — chỉ tới đây mới thực sự "giữ chỗ" một lượt gọi tốn tiền.
  const quota = await consumeQuota(
    deps.db,
    auth.uid,
    { quotaStudentPerDay: config.quotaStudentPerDay, rateLimitPerMinute: config.rateLimitPerMinute },
    deps.now,
  );
  if (!quota.allowed) {
    throw new HttpsError(
      "resource-exhausted",
      "Bạn đã dùng hết lượt phản chiếu AI hôm nay, thử lại sau nhé.",
    );
  }

  // 7-8. moodLog phải tồn tại VÀ thuộc về đúng người gọi — callable chạy bằng Admin SDK nên
  // Security Rules không bảo vệ, phải tự so sánh userId.
  const moodLogSnap = await deps.db.collection("moodLogs").doc(moodLogId).get();
  if (!moodLogSnap.exists) {
    throw new HttpsError("not-found", "Không tìm thấy nhật ký tâm trạng này.");
  }
  const moodLogData = moodLogSnap.data() as Record<string, unknown>;
  if (moodLogData.userId !== auth.uid) {
    throw new HttpsError("permission-denied", "Bạn không có quyền truy cập nhật ký này.");
  }

  const { template, promptTemplateId, promptVersion } = await loadPromptTemplate(deps.db);
  const { systemPrompt, userPrompt } = buildMoodPrompt(moodLogData, template);

  let result: ChatCompletionResult;
  try {
    result = await deps.callChatCompletion({
      baseUrl: config.baseUrl,
      apiKey: deps.apiKey,
      model: config.model,
      systemPrompt,
      userPrompt,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof AiProviderError) {
      // KHÔNG đưa error.message (có thể chứa status code, gợi ý baseUrl) vào lỗi trả về
      // client — chỉ log nội bộ.
      console.error("generateReflection: callChatCompletion thất bại", {
        kind: error.kind,
        uid: auth.uid,
      });
      throw new HttpsError("internal", GENERIC_MODEL_FAILURE_MESSAGE);
    }
    throw error;
  }

  // 10. Lọc an toàn chạy trên TOÀN BỘ văn bản thô, TRƯỚC khi tách ba phần — model có thể
  // chèn ngôn ngữ chẩn đoán ở phần mở đầu (preamble) nằm ngoài ba nhãn.
  const safety = checkOutputSafety(result.text);
  if (!safety.safe) {
    // Chỉ ghi metadata — KHÔNG BAO GIỜ ghi output bị chặn hay uid học sinh. Output này là
    // phản chiếu về ghi chú riêng tư của một học sinh; ghi nó vào một log admin đọc được sẽ
    // mở lại đúng lỗ hổng mà lệnh cấm admin đọc aiJournalOutputs đang đóng.
    await deps.db.collection("aiSafetyLog").add({
      triggeredKeyword: extractTriggeredKeyword(safety.reason),
      model: config.model,
      promptTemplateId,
      createdAt: FieldValue.serverTimestamp(),
    });
    throw new HttpsError("internal", GENERIC_MODEL_FAILURE_MESSAGE);
  }

  // 11. Tách output — thiếu một nhãn hoặc một phần rỗng đều coi là hỏng, không đoán mò.
  const parsed = parseReflectionOutput(result.text);
  if (parsed === null) {
    throw new HttpsError("internal", GENERIC_MODEL_FAILURE_MESSAGE);
  }

  const outputRef = await deps.db.collection("aiJournalOutputs").add({
    userId: auth.uid,
    moodLogId,
    reflectionText: parsed.reflectionText,
    catStoryText: parsed.catStoryText,
    journalPrompt: parsed.journalPrompt,
    promptTemplateId,
    promptVersion,
    providerLabel: config.providerLabel,
    model: config.model,
    userFeedback: null,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { outputId: outputRef.id };
}

export const generateReflection = onCall(
  { region: "asia-southeast1", secrets: [aiApiKeySecret] },
  async (request) => {
    const auth = request.auth
      ? { uid: request.auth.uid, emailVerified: request.auth.token.email_verified === true }
      : undefined;

    return runGenerateReflection(auth, request.data, {
      db: getFirestore(),
      now: new Date(),
      apiKey: aiApiKeySecret.value(),
      callChatCompletion: callChatCompletionDefault,
    });
  },
);

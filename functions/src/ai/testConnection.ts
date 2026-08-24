// Callable admin-only "Thử kết nối" (Task 12, Decision E): xác nhận baseUrl/model/API key
// đang cắm đúng TRƯỚC khi admin bật kill switch cho học sinh. Trình duyệt của admin KHÔNG
// BAO GIỜ được cầm API key, nên việc thử này phải đi qua một callable server-side — không
// phải fetch phía client. Gửi đúng một prompt CỐ ĐỊNH, ngắn — không tốn quota học sinh (không
// đụng tới collection aiUsage, khác hẳn generateReflection).
//
// Response trả về CHỈ được mang `ok` và (khi thất bại) một `kind`/`message` đã được rút gọn
// từ AiProviderErrorKind — KHÔNG BAO GIỜ raw response text, header, baseUrl, hay API key.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { assertCallerIsAdmin, PermissionDeniedError, type CallerAuth } from "../admin/guards";
import { aiConfigSchema, type AiConfig } from "./config";
import {
  callChatCompletion as callChatCompletionDefault,
  AiProviderError,
  type ChatCompletionResult,
  type AiProviderErrorKind,
} from "./openaiClient";

const aiApiKeySecret = defineSecret("EXAMCALM_AI_API_KEY");

/** Ngắn hơn nhiều so với AI_REQUEST_TIMEOUT_MS của generateReflection (30s) — đây chỉ là một
 *  lượt kiểm tra kết nối, admin đang đợi kết quả trực tiếp trên màn hình. */
const TEST_REQUEST_TIMEOUT_MS = 15_000;

/** Một prompt cố định, ngắn — không phụ thuộc dữ liệu học sinh, không đổi giữa các lần gọi. */
const TEST_SYSTEM_PROMPT = "Bạn là một bài kiểm tra kết nối tới AI provider. Trả lời đúng một từ được yêu cầu, không thêm gì khác.";
const TEST_USER_PROMPT = "Trả lời đúng một từ: OK";
const TEST_MAX_TOKENS = 20;

export type TestAiConnectionResult =
  | { ok: true }
  | { ok: false; kind: AiProviderErrorKind | "not_configured" | "invalid_config"; message: string };

export type TestAiConnectionDeps = {
  db: Firestore;
  apiKey: string;
  callChatCompletion: (
    ...args: Parameters<typeof callChatCompletionDefault>
  ) => Promise<ChatCompletionResult>;
};

/** Câu trả lời rút gọn cho từng loại lỗi provider — chỉ dùng `kind` (một nhãn phân loại có
 *  cấu trúc, xem AiProviderError ở openaiClient.ts), KHÔNG BAO GIỜ đưa error.message gốc (có
 *  thể chứa status code kèm gợi ý baseUrl) hay bất kỳ phần nào của response/headers ra ngoài. */
const SANITIZED_MESSAGES: Record<AiProviderErrorKind, string> = {
  auth: "Xác thực với AI provider thất bại — kiểm tra lại API key đã đặt trong Secret Manager.",
  rate_limit: "AI provider trả về lỗi giới hạn tần suất (429). Thử lại sau.",
  server: "Không kết nối được tới AI provider — kiểm tra lại baseUrl và model.",
  bad_response: "AI provider phản hồi không đúng định dạng mong đợi.",
  timeout: "Kết nối tới AI provider quá hạn.",
};

/** Đọc systemConfig/aiConfig. Khác loadAiConfig() của generateReflection.ts: ở ĐÂY doc thiếu
 *  hoặc sai hình dạng phải BÁO CHO ADMIN (trả về null), không được âm thầm rơi về
 *  DEFAULT_AI_CONFIG — admin đang chủ động bấm "Thử kết nối" để chẩn đoán cấu hình, im lặng
 *  dùng cấu hình rỗng sẽ khiến họ hiểu nhầm "kết nối thất bại" trong khi vấn đề thật là
 *  document chưa hợp lệ. */
async function loadAiConfig(db: Firestore): Promise<AiConfig | null> {
  const snap = await db.collection("systemConfig").doc("aiConfig").get();
  if (!snap.exists) return null;
  const parsed = aiConfigSchema.safeParse(snap.data());
  return parsed.success ? parsed.data : null;
}

/**
 * Lõi có thể test được — nhận auth/deps đã bóc tách sẵn, không phụ thuộc runtime thật của
 * Cloud Functions. Ném PermissionDeniedError trực tiếp (không cần onCall bọc quanh) để test
 * gọi thẳng hàm này với Firestore emulator và một callChatCompletion giả.
 */
export async function runTestAiConnection(
  auth: CallerAuth,
  deps: TestAiConnectionDeps,
): Promise<TestAiConnectionResult> {
  assertCallerIsAdmin(auth);

  const config = await loadAiConfig(deps.db);
  if (!config) {
    return {
      ok: false,
      kind: "invalid_config",
      message: "Cấu hình AI (systemConfig/aiConfig) chưa tồn tại hoặc không hợp lệ.",
    };
  }
  if (config.baseUrl === "" || config.model === "") {
    return {
      ok: false,
      kind: "not_configured",
      message: "Chưa cấu hình baseUrl hoặc model — điền đủ hai trường này rồi lưu trước khi thử kết nối.",
    };
  }

  try {
    await deps.callChatCompletion({
      baseUrl: config.baseUrl,
      apiKey: deps.apiKey,
      model: config.model,
      systemPrompt: TEST_SYSTEM_PROMPT,
      userPrompt: TEST_USER_PROMPT,
      temperature: 0,
      maxTokens: TEST_MAX_TOKENS,
      timeoutMs: TEST_REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof AiProviderError) {
      console.error("testAiConnection: callChatCompletion thất bại", { kind: error.kind });
      return { ok: false, kind: error.kind, message: SANITIZED_MESSAGES[error.kind] };
    }
    throw error;
  }

  return { ok: true };
}

export const testAiConnection = onCall(
  { region: "asia-southeast1", secrets: [aiApiKeySecret] },
  async (request) => {
    const auth = request.auth
      ? { uid: request.auth.uid, token: request.auth.token as Record<string, unknown> }
      : undefined;

    try {
      return await runTestAiConnection(auth, {
        db: getFirestore(),
        apiKey: aiApiKeySecret.value(),
        callChatCompletion: callChatCompletionDefault,
      });
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        throw new HttpsError("permission-denied", error.message);
      }
      throw error;
    }
  },
);

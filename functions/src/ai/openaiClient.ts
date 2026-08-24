// Điểm cắm duy nhất tới bất kỳ endpoint tương thích OpenAI (chat/completions).
// Module này thuần TypeScript, không import firebase-admin, không đọc Firestore —
// mọi thứ cần thiết đều nhận qua tham số để test được mà không cần emulator.
//
// Chỉ dùng phần lõi của chat/completions: model, messages, temperature, max_tokens,
// stream: false. Không tools, không response_format, không tiện ích riêng của vendor —
// bề mặt càng hẹp thì càng nhiều provider cắm vừa.

export type ChatCompletionParams = {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
};

export type ChatCompletionResult = { text: string; finishReason: string | null };

export type AiProviderErrorKind = "auth" | "rate_limit" | "server" | "bad_response" | "timeout";

export class AiProviderError extends Error {
  readonly kind: AiProviderErrorKind;

  constructor(kind: AiProviderErrorKind, message: string) {
    super(message);
    this.name = "AiProviderError";
    this.kind = kind;
  }
}

/**
 * Đọc content từ body JSON dạng { choices: [{ message: { content } }] }.
 * Trả về null nếu bất kỳ phần nào trong đường dẫn thiếu hoặc sai kiểu — không
 * đoán mò, để callChatCompletion ném AiProviderError("bad_response", ...).
 */
function extractMessageContent(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null) return null;
  const message = (first as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return null;

  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

/** Đọc finish_reason (tuỳ chọn) của choices[0], null nếu thiếu hoặc sai kiểu. */
function extractFinishReason(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null) return null;
  const finishReason = (first as { finish_reason?: unknown }).finish_reason;
  return typeof finishReason === "string" ? finishReason : null;
}

export async function callChatCompletion(
  params: ChatCompletionParams,
  deps?: { fetchImpl?: typeof fetch },
): Promise<ChatCompletionResult> {
  const fetchImpl = deps?.fetchImpl ?? fetch;
  // Chuẩn hoá baseUrl: bỏ mọi dấu "/" ở cuối trước khi nối "/chat/completions" —
  // lỗi cấu hình phổ biến nhất khi cắm provider mới là baseUrl thừa dấu "/".
  const url = `${params.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiProviderError("timeout", `Yêu cầu tới AI provider quá hạn ${params.timeoutMs}ms.`);
    }
    // Lỗi mạng khác (DNS, connection refused...) không có status code để phân loại
    // chi tiết hơn — không đưa error gốc vào message vì có thể chứa URL kèm thông
    // tin nhạy cảm từ request.
    throw new AiProviderError("server", "Không thể kết nối tới AI provider.");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    // Không đọc/echo body hay headers của response lỗi vào message — chỉ dùng status
    // code để phân loại, tránh rò rỉ nếu provider echo lại request (kể cả apiKey).
    let kind: AiProviderErrorKind;
    if (response.status === 401 || response.status === 403) {
      kind = "auth";
    } else if (response.status === 429) {
      kind = "rate_limit";
    } else {
      // 5xx và các mã khác (400, 404...) đều gộp vào "server" — các mã này thường
      // do baseUrl hoặc model cấu hình sai, lỗi phổ biến nhất khi cắm provider mới.
      kind = "server";
    }
    throw new AiProviderError(kind, `AI provider trả về lỗi HTTP ${response.status}.`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AiProviderError("bad_response", "Phản hồi từ AI provider không phải JSON hợp lệ.");
  }

  const text = extractMessageContent(body);
  if (text === null) {
    throw new AiProviderError(
      "bad_response",
      "Phản hồi từ AI provider thiếu choices[0].message.content.",
    );
  }

  return { text, finishReason: extractFinishReason(body) };
}

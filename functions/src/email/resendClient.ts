// Điểm cắm duy nhất tới Resend (https://resend.com) để gửi email cảnh báo khủng hoảng cho admin
// (ExamCalm Spec #5). Module này thuần TypeScript, không import firebase-admin, không đọc
// Firestore — mọi thứ cần thiết đều nhận qua tham số để test được mà không cần emulator. Cùng
// khuôn với functions/src/ai/openaiClient.ts (đã qua nhiều vòng review) — tái dùng lại các quyết
// định của module đó thay vì tự nghĩ lại: injectable fetch, một error taxonomy nhỏ, clear timer
// trên MỌI nhánh, và không bao giờ để apiKey lọt vào message lỗi.

const RESEND_API_URL = "https://api.resend.com/emails";

export type SendEmailParams = {
  apiKey: string;
  from: string;
  to: string[];
  // Fix round 1 cho Task 2 (Finding 5, coordinator — ExamCalm Spec #5): tuỳ chọn, dùng khi caller
  // muốn gửi hàng loạt mà không lộ địa chỉ người nhận cho nhau — nếu một người FORWARD lại mail,
  // header "To:" không liệt kê ai khác. Rỗng/vắng mặt = hành vi cũ (chỉ `to`).
  bcc?: string[];
  subject: string;
  text: string;
  timeoutMs: number;
};

export type SendEmailResult = { id: string };

export type EmailErrorKind = "auth" | "rate_limit" | "server" | "bad_response" | "timeout";

export class EmailError extends Error {
  readonly kind: EmailErrorKind;

  constructor(kind: EmailErrorKind, message: string) {
    super(message);
    this.name = "EmailError";
    this.kind = kind;
  }
}

/** Đọc `id` từ body JSON dạng `{ id: string, ... }`. Trả về null nếu thiếu hoặc sai kiểu — không
 *  đoán mò, để sendEmail ném EmailError("bad_response", ...). */
function extractId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const id = (body as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

export async function sendEmail(
  params: SendEmailParams,
  deps?: { fetchImpl?: typeof fetch },
): Promise<SendEmailResult> {
  const fetchImpl = deps?.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: params.from,
        to: params.to,
        // Chỉ đưa "bcc" vào body khi caller thật sự truyền — giữ nguyên hình dạng request cũ
        // (không thêm key rỗng/undefined) khi không dùng, không phá vỡ test/behavior sẵn có.
        ...(params.bcc && params.bcc.length > 0 ? { bcc: params.bcc } : {}),
        subject: params.subject,
        text: params.text,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new EmailError("timeout", `Yêu cầu gửi email tới Resend quá hạn ${params.timeoutMs}ms.`);
    }
    // Lỗi mạng khác (DNS, connection refused...) không có status code để phân loại chi tiết hơn —
    // không đưa error gốc vào message vì có thể chứa URL kèm thông tin nhạy cảm từ request.
    throw new EmailError("server", "Không thể kết nối tới Resend.");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    // Không đọc/echo body hay headers của response lỗi vào message — chỉ dùng status code để
    // phân loại, tránh rò rỉ nếu Resend echo lại request (kể cả apiKey).
    let kind: EmailErrorKind;
    if (response.status === 401 || response.status === 403) {
      kind = "auth";
    } else if (response.status === 429) {
      kind = "rate_limit";
    } else {
      // 5xx và các mã khác (400, 404...) đều gộp vào "server" — các mã này thường do "from"/domain
      // gửi cấu hình sai ở Resend, lỗi phổ biến nhất khi mới cắm provider.
      kind = "server";
    }
    throw new EmailError(kind, `Resend trả về lỗi HTTP ${response.status}.`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new EmailError("bad_response", "Phản hồi từ Resend không phải JSON hợp lệ.");
  }

  const id = extractId(body);
  if (id === null) {
    throw new EmailError("bad_response", "Phản hồi từ Resend thiếu field id.");
  }

  return { id };
}

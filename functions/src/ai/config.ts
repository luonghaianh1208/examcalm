// Bản mirror CỤC BỘ của `aiConfigSchema` (src/lib/types/ai.ts). Package `functions/` không
// import được từ `src/` — tsconfig và quá trình build (`tsc` biên dịch riêng cho Cloud
// Functions) tách biệt hoàn toàn với app Next.js. Vì vậy schema cấu hình AI phải được khai
// báo lại ở đây, giữ ĐÚNG cùng danh sách field và cùng ràng buộc với bản gốc.
//
// AI_CONFIG_FIELD_KEYS export riêng danh sách tên field (không phải cả schema) để một test
// sau này (Task 13) so sánh được với danh sách field của aiConfigSchema bên src/ mà không
// cần import chéo package — chỉ cần so hai mảng string.

import { z } from "zod";

// Giống bản gốc: baseUrl phải là https, trừ http://localhost hoặc http://127.0.0.1 (Ollama
// chạy máy nội bộ).
const LOCAL_HTTP_BASE_URL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/;

export const aiConfigSchema = z.object({
  providerLabel: z.string(),
  // "" là sentinel "chưa cấu hình" — khớp DEFAULT_AI_CONFIG bên dưới.
  baseUrl: z
    .string()
    .refine(
      (url) =>
        url === "" ||
        (z.string().url().safeParse(url).success &&
          (url.startsWith("https://") || LOCAL_HTTP_BASE_URL.test(url))),
      {
        message:
          "baseUrl phải rỗng (chưa cấu hình) hoặc dùng https:// (trừ http://localhost hoặc http://127.0.0.1)",
      },
    ),
  model: z.string(),
  temperature: z.number().min(0).max(1),
  // Sàn 1, không 0 (M10, final whole-branch review): xem giải thích đầy đủ ở
  // src/lib/types/ai.ts — max_tokens=0 vẫn đi ra provider và vẫn trừ quota, chỉ trả về rỗng/lỗi.
  maxTokens: z.number().int().min(1).max(2000),
  // HAI FIELD DƯỚI ĐÂY CỐ Ý QUY ƯỚC NGƯỢC NHAU CHO GIÁ TRỊ 0 — xem giải thích đầy đủ ở
  // src/lib/types/ai.ts (aiConfigSchema) và functions/src/ai/quota.ts:
  // - quotaStudentPerDay = 0  → KHÔNG học sinh nào được gọi AI trong ngày (ngân sách cạn).
  // - rateLimitPerMinute = 0  → KHÔNG áp rate limit (phanh burst tắt), NGƯỢC LẠI quy ước trên.
  quotaStudentPerDay: z.number().int().min(0),
  // chatQuotaPerDay đi theo CÙNG quy ước với quotaStudentPerDay (ngân sách chi phí, đếm tin
  // chat/ngày, dùng lại consumeQuota với khoá khác — design spec §6): 0 = không tin chat nào
  // được gửi trong ngày. Mặc định KHÔNG im lặng như quotaStudentPerDay — xem
  // src/lib/types/ai.ts để biết lý do đầy đủ.
  chatQuotaPerDay: z.number().int().min(0),
  rateLimitPerMinute: z.number().int().min(0),
  // chatRateLimitPerMinute là phanh chống burst RIÊNG cho chat (Fix round 1, Task 5, Finding
  // 2a) — cùng quy ước với rateLimitPerMinute (0 = không áp rate limit). Xem src/lib/types/ai.ts.
  chatRateLimitPerMinute: z.number().int().min(0),
  killSwitch: z.object({
    // true = tính năng ĐANG TẮT. false = tính năng đang bật — đọc ngược field này là lỗi
    // tốn tiền, kiểm tra kỹ trước khi dùng (xem src/lib/types/ai.ts).
    moodReflection: z.boolean(),
    // Công tắc RIÊNG cho chat (Fix round 1, Task 5, Finding 2b) — độc lập với moodReflection,
    // mặc định true (tắt). Xem src/lib/types/ai.ts.
    chat: z.boolean(),
  }),
  // ExamCalm Spec #5: cấu hình gửi mail khi có crisisAlerts — KHÔNG PHẢI cấu hình AI, nhưng
  // sống chung document aiConfig CÓ CHỦ ĐÍCH (lý do đầy đủ ở src/lib/types/ai.ts): cảnh báo chỉ
  // sinh từ chat, chat cần AI, và dùng chung document thì tái dùng được test đồng bộ này, batch
  // ghi atomic, rule, và trang admin đã có thay vì mở một document/rule/đường ghi riêng.
  // C1 (final whole-branch review): `.default(false)` — lý do đầy đủ ở src/lib/types/ai.ts. Tài
  // liệu production được ghi TRƯỚC khi hai field này tồn tại thiếu hẳn chúng; không default thì
  // safeParse rớt cả document ở năm điểm đọc khác nhau (một trong số đó ghi đè toàn bộ document).
  crisisEmailEnabled: z.boolean().default(false),
  // "" là sentinel "chưa cấu hình" — cùng quy ước baseUrl/model ở trên.
  crisisEmailFrom: z.string().default(""),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;

/** Danh sách tên field top-level của aiConfigSchema, dùng để so đồng bộ với bản gốc ở
 *  src/lib/types/ai.ts trong test Task 13. */
export const AI_CONFIG_FIELD_KEYS = Object.keys(aiConfigSchema.shape) as (keyof AiConfig)[];

/** true nếu baseUrl VÀ model đã cấu hình — điều kiện CHUNG bắt buộc cho CẢ HAI tính năng (chúng
 *  dùng chung một provider). KHÔNG tự đủ để bật bất kỳ tính năng nào — còn cần killSwitch VÀ
 *  quota RIÊNG của từng tính năng, xem isReflectionEnabled/isChatEnabled bên dưới. */
function hasProviderConfigured(config: Pick<AiConfig, "baseUrl" | "model">): boolean {
  return config.baseUrl !== "" && config.model !== "";
}

/**
 * true khi và chỉ khi tính năng PHẢN CHIẾU sẵn sàng phục vụ học sinh — provider đã cấu hình,
 * `killSwitch.moodReflection` tắt, VÀ `quotaStudentPerDay > 0` (M8, final whole-branch review:
 * quota mặc định khi ship là 0 — "không lượt nào", không phải "không giới hạn"; thiếu điều kiện
 * này thì một quota=0 vẫn để tính năng bật, khiến MỌI lượt gọi rớt resource-exhausted ngay lập
 * tức cho một học sinh chưa dùng lượt nào).
 *
 * Giá trị này ghi thẳng vào `systemConfig/aiPublic.reflectionEnabled` (saveAiConfig.ts) —
 * `ReflectionCard.tsx` gate TRÊN field này (Task 9 fix round 1, Finding 2 — KHÔNG PHẢI trên
 * `enabled`, xem giải thích ở `isAiEnabled` bên dưới).
 */
export function isReflectionEnabled(
  config: Pick<AiConfig, "baseUrl" | "model" | "killSwitch" | "quotaStudentPerDay">,
): boolean {
  return (
    hasProviderConfigured(config) &&
    config.killSwitch.moodReflection === false &&
    config.quotaStudentPerDay > 0
  );
}

/**
 * true khi và chỉ khi tính năng CHAT sẵn sàng phục vụ học sinh — cùng điều kiện với
 * `isReflectionEnabled`, nhưng xét `killSwitch.chat` + `chatQuotaPerDay` RIÊNG (Fix round 1,
 * Task 5, Finding 2a/2b: chat có killSwitch và quota tách biệt hoàn toàn khỏi phản chiếu).
 *
 * Ghi thẳng vào `systemConfig/aiPublic.chatEnabled` — `ChatWindow.tsx` gate TRÊN field này.
 */
export function isChatEnabled(
  config: Pick<AiConfig, "baseUrl" | "model" | "killSwitch" | "chatQuotaPerDay">,
): boolean {
  return (
    hasProviderConfigured(config) &&
    config.killSwitch.chat === false &&
    config.chatQuotaPerDay > 0
  );
}

/**
 * Bản mirror của isAiEnabled() ở src/lib/firestore/admin-ai.ts — package functions/ không
 * import được src/ (xem giải thích ở đầu file). Dùng bởi Cloud Function saveAiConfig
 * (functions/src/admin/saveAiConfig.ts, fix I4+I5) để derive systemConfig/aiPublic.enabled từ
 * phía Admin SDK.
 *
 * true khi VÀ CHỈ KHI ÍT NHẤT MỘT trong hai tính năng (phản chiếu HOẶC chat) sẵn sàng — OR,
 * KHÔNG PHẢI AND (Task 9, task-9-brief.md).
 *
 * `enabled` KHÔNG PHẢI flag duy nhất gate quyền dùng AI của học sinh — nó CHỈ quyết định đúng
 * MỘT điều: màn hình đồng ý (AiConsentSection.tsx) có hiện ô tick "aiOptIn" hay không. CHÍNH ô
 * tick đó (một field DUY NHẤT trên users/{uid}) gate quyền truy cập CẢ HAI tính năng
 * (generateReflection.ts VÀ sendChatMessage.ts đều tự đọc privacySettings.aiOptIn, độc lập với
 * nhau) — nên OR là đúng ở ĐÂY: một admin cố ý bật RIÊNG một trong hai tính năng (đúng kịch bản
 * §10 design spec — chờ chuyên gia tâm lý duyệt tính năng còn lại trước khi bật) vẫn phải hiện
 * được ô tick, nếu không tính năng admin VỪA bật cũng không học sinh nào chạm tới được.
 *
 * Task 9 fix round 1 (Finding 2, CRITICAL — reviewer): bản đầu của quyết định OR này DỪNG ở
 * `enabled`, nhưng `ReflectionCard.tsx`/`ChatWindow.tsx` cũng đang gate TRỰC TIẾP trên
 * `aiPublic.enabled` — nghĩa là bật RIÊNG chat (kịch bản §10) làm `enabled=true`, và
 * ReflectionCard MỞ CỔNG dù killSwitch.moodReflection vẫn tắt: học sinh viết nhật ký, gọi
 * generateReflection, và mọi lượt đều rớt lỗi — chính lỗi hình dạng M8 tái diễn ở một tầng khác.
 * SỬA: hai component đó giờ gate trên `reflectionEnabled`/`chatEnabled` RIÊNG (xem trên) —
 * `enabled` chỉ còn dùng cho ô tick đồng ý.
 */
export function isAiEnabled(
  config: Pick<
    AiConfig,
    "baseUrl" | "model" | "killSwitch" | "quotaStudentPerDay" | "chatQuotaPerDay"
  >,
): boolean {
  return isReflectionEnabled(config) || isChatEnabled(config);
}

/**
 * Mirror của CURRENT_AI_CONSENT_VERSION (src/lib/types/ai-consent.ts) — cùng lý do mirror
 * aiConfigSchema ở trên (package functions/ không import được src/ ở runtime). Dùng bởi
 * sendChatMessage.ts để KHÔNG chỉ tin vào cổng phía client (ChatWindow.tsx): một học sinh đồng
 * ý dưới hộp thoại CŨ (trước khi chat tồn tại, `aiConsentVersion` thiếu hoặc < giá trị này)
 * không được phép gọi được callable chat, kể cả khi cố gọi thẳng bỏ qua UI.
 */
export const CURRENT_AI_CONSENT_VERSION = 2;

export const DEFAULT_AI_CONFIG: AiConfig = {
  providerLabel: "",
  baseUrl: "",
  model: "",
  temperature: 0.7,
  maxTokens: 500,
  quotaStudentPerDay: 0,
  chatQuotaPerDay: 30,
  rateLimitPerMinute: 3,
  chatRateLimitPerMinute: 20,
  // Mặc định hệ thống là im lặng: kill switch true = tính năng đang tắt.
  killSwitch: { moodReflection: true, chat: true },
  // Spec #5: mặc định TẮT và CHƯA cấu hình — cùng nguyên tắc "hệ thống mặc định im lặng".
  crisisEmailEnabled: false,
  crisisEmailFrom: "",
};

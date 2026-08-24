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
  killSwitch: z.object({
    // true = tính năng ĐANG TẮT. false = tính năng đang bật — đọc ngược field này là lỗi
    // tốn tiền, kiểm tra kỹ trước khi dùng (xem src/lib/types/ai.ts).
    moodReflection: z.boolean(),
  }),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;

/** Danh sách tên field top-level của aiConfigSchema, dùng để so đồng bộ với bản gốc ở
 *  src/lib/types/ai.ts trong test Task 13. */
export const AI_CONFIG_FIELD_KEYS = Object.keys(aiConfigSchema.shape) as (keyof AiConfig)[];

/**
 * Bản mirror của isAiEnabled() ở src/lib/firestore/admin-ai.ts — package functions/ không
 * import được src/ (xem giải thích ở đầu file). Dùng bởi Cloud Function saveAiConfig
 * (functions/src/admin/saveAiConfig.ts, fix I4+I5) để derive systemConfig/aiPublic.enabled từ
 * phía Admin SDK.
 *
 * M8 (final whole-branch review): CỘNG thêm quotaStudentPerDay > 0 — quota mặc định khi ship
 * là 0 ("không lượt nào", xem aiConfigSchema). Thiếu điều kiện này, aiPublic.enabled=true dù
 * quota=0 khiến màn hình đồng ý mời học sinh bật một tính năng mà MỌI lượt gọi đều rớt
 * resource-exhausted ngay lập tức.
 */
export function isAiEnabled(
  config: Pick<AiConfig, "baseUrl" | "model" | "killSwitch" | "quotaStudentPerDay">,
): boolean {
  return (
    config.baseUrl !== "" && config.model !== "" &&
    config.killSwitch.moodReflection === false && config.quotaStudentPerDay > 0
  );
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  providerLabel: "",
  baseUrl: "",
  model: "",
  temperature: 0.7,
  maxTokens: 500,
  quotaStudentPerDay: 0,
  chatQuotaPerDay: 30,
  rateLimitPerMinute: 3,
  // Mặc định hệ thống là im lặng: kill switch true = tính năng đang tắt.
  killSwitch: { moodReflection: true },
};

import { z } from "zod";

// baseUrl phải là https trên Internet — ghi chú cảm xúc học sinh không được
// đi qua kết nối không mã hoá. Ngoại lệ duy nhất: http://localhost hoặc
// http://127.0.0.1 (bất kỳ port/path nào) để cắm Ollama chạy máy nội bộ.
const LOCAL_HTTP_BASE_URL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/;

export const aiConfigSchema = z.object({
  // Tên provider hiển thị cho học sinh ở màn hình đồng ý — không phải giá trị bí mật.
  providerLabel: z.string(),
  // "" là sentinel "chưa cấu hình" (giống model rỗng bên dưới) — DEFAULT_AI_CONFIG
  // dùng giá trị này nên bản thân schema phải chấp nhận nó, không thì hằng số
  // mặc định sẽ tự làm hỏng chính schema của nó khi có ai parse lại sau này.
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
  // Trần cứng 2000 token — phanh chi phí không sửa được từ Admin console.
  // Một phản chiếu 2–4 câu không cần hơn. Sàn 1 (M10, final whole-branch review): 0 KHÔNG phải
  // "tắt" — provider trả về rỗng hoặc lỗi 400 với max_tokens=0, request đó vẫn đi ra ngoài và
  // vẫn bị trừ quota (xem functions/src/ai/generateReflection.ts, quota trừ TRƯỚC
  // callChatCompletion) trong khi học sinh không nhận được gì. Muốn tắt tính năng thì dùng
  // killSwitch, không phải maxTokens=0.
  maxTokens: z.number().int().min(1).max(2000),
  // HAI FIELD NÀY CỐ Ý QUY ƯỚC NGƯỢC NHAU CHO GIÁ TRỊ 0 — đọc cả hai đoạn chú
  // thích trước khi sửa bất kỳ field nào ở đây (Task 7, fix round 1):
  //
  // - quotaStudentPerDay là NGÂN SÁCH CHI PHÍ trong ngày: 0 nghĩa là KHÔNG học
  //   sinh nào được gọi AI trong ngày — KHÔNG PHẢI "không giới hạn". Khớp với
  //   DEFAULT_AI_CONFIG (hệ thống mặc định im lặng). Admin muốn nới quota thì
  //   nhập một số dương.
  quotaStudentPerDay: z.number().int().min(0),
  // - rateLimitPerMinute chỉ là PHANH CHỐNG BURST trong một ngày, KHÔNG PHẢI
  //   ngân sách — nó không quyết định ngân sách của ngày, quotaStudentPerDay
  //   mới quyết định. Vì vậy 0 ở đây nghĩa là KHÔNG áp rate limit (bỏ qua hoàn
  //   toàn bước kiểm tra), NGƯỢC LẠI với quotaStudentPerDay. "0 = không giới
  //   hạn burst" khớp với mô hình tư duy thông thường về một cái phanh; còn
  //   "0 = không giới hạn ngân sách" thì không ai nghĩ vậy về một ngân sách.
  //   Nhầm chiều field này (coi 0 là "khoá vĩnh viễn sau lượt đầu") từng khiến
  //   admin bật quota lên nhưng quên nâng field này, khiến mọi học sinh bị kẹt
  //   ở đúng 1 lượt/ngày mà không có thông báo nào giải thích vì sao — xem
  //   functions/src/ai/quota.ts. DEFAULT_AI_CONFIG đặt field này = 3 (không
  //   phải 0) để tránh ship một mặc định "không giới hạn burst".
  rateLimitPerMinute: z.number().int().min(0),
  killSwitch: z.object({
    // CHÚ Ý CHIỀU: true = tính năng ĐANG TẮT. false = tính năng đang bật.
    // Đọc ngược field này là một lỗi tốn tiền — kiểm tra kỹ trước khi dùng.
    moodReflection: z.boolean(),
  }),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;

export const DEFAULT_AI_CONFIG: AiConfig = {
  providerLabel: "",
  baseUrl: "",
  model: "",
  temperature: 0.7,
  maxTokens: 500,
  quotaStudentPerDay: 0,
  // 3, không phải 0 — 0 ở field này nghĩa là "không rate limit" (xem chú
  // thích ở aiConfigSchema), và một mặc định hệ thống cho một tính năng brake
  // chi phí không nên là "không giới hạn burst". quotaStudentPerDay = 0 đã
  // chặn mọi lượt gọi khi tính năng còn tắt, nên giá trị này chỉ có tác dụng
  // sau khi admin bật tính năng (belt and braces).
  rateLimitPerMinute: 3,
  // Mặc định hệ thống là im lặng: kill switch true = tính năng đang tắt.
  killSwitch: { moodReflection: true },
};

export const promptTemplateSchema = z.object({
  name: z.string().min(1),
  version: z.number().int().min(1),
  status: z.enum(["draft", "published"]),
  systemPrompt: z.string().min(1),
  userTemplate: z.string().min(1),
  updatedBy: z.string().min(1),
  updatedAt: z.date(),
});

export type PromptTemplate = z.infer<typeof promptTemplateSchema>;

export const aiJournalOutputSchema = z.object({
  userId: z.string().min(1),
  moodLogId: z.string().min(1),
  reflectionText: z.string().min(1),
  catStoryText: z.string(),
  journalPrompt: z.string(),
  promptTemplateId: z.string().min(1),
  promptVersion: z.number().int().min(1),
  providerLabel: z.string(),
  model: z.string(),
  userFeedback: z.enum(["helpful", "not_helpful"]).nullable(),
  createdAt: z.date(),
});

export type AiJournalOutput = z.infer<typeof aiJournalOutputSchema>;

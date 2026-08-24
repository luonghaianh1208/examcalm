import { z } from "zod";

// baseUrl phải là https trên Internet — ghi chú cảm xúc học sinh không được
// đi qua kết nối không mã hoá. Ngoại lệ duy nhất: http://localhost hoặc
// http://127.0.0.1 (bất kỳ port/path nào) để cắm Ollama chạy máy nội bộ.
const LOCAL_HTTP_BASE_URL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/;

export const aiConfigSchema = z.object({
  // Tên provider hiển thị cho học sinh ở màn hình đồng ý — không phải giá trị bí mật.
  providerLabel: z.string(),
  baseUrl: z
    .string()
    .url()
    .refine((url) => url.startsWith("https://") || LOCAL_HTTP_BASE_URL.test(url), {
      message: "baseUrl phải dùng https:// (trừ http://localhost hoặc http://127.0.0.1)",
    }),
  model: z.string(),
  temperature: z.number().min(0).max(1),
  // Trần cứng 2000 token — phanh chi phí không sửa được từ Admin console.
  // Một phản chiếu 2–4 câu không cần hơn.
  maxTokens: z.number().int().min(0).max(2000),
  // 0 nghĩa là tắt quota (không giới hạn theo ngày).
  quotaStudentPerDay: z.number().int().min(0),
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
  rateLimitPerMinute: 0,
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

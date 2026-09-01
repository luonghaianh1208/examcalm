import { z } from "zod";

// baseUrl phải là https trên Internet — ghi chú cảm xúc học sinh không được
// đi qua kết nối không mã hoá. Ngoại lệ duy nhất: http://localhost hoặc
// http://127.0.0.1 (bất kỳ port/path nào) để cắm Ollama chạy máy nội bộ.
const LOCAL_HTTP_BASE_URL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/;

/**
 * Nhà cung cấp AI — ĐÓNG CỨNG trong mã nguồn, không đọc từ Firestore.
 *
 * Trước đây admin nhập baseUrl ở trang quản trị. Bỏ đi vì hai lý do:
 *
 *   1. AN TOÀN. Đây là địa chỉ mà ghi chú cảm xúc và bài Confession của học
 *      sinh vị thành niên được gửi tới. Còn sửa được từ giao diện nghĩa là một
 *      tài khoản quản trị bị chiếm — hoặc một lần gõ nhầm — đủ để chuyển hướng
 *      toàn bộ dữ liệu đó sang một máy chủ khác. Hằng số trong mã nguồn thì
 *      phải qua review và deploy mới đổi được.
 *
 *   2. TRUNG THỰC VỚI HỌC SINH. Màn hình xin đồng ý nói rõ tên nơi nhận dữ
 *      liệu. Tên đó lấy từ PROVIDER_LABEL, nên nó không bao giờ lệch khỏi nơi
 *      dữ liệu thật sự đi tới.
 *
 * Hai field baseUrl và providerLabel vẫn còn trong schema để document cũ parse
 * được, nhưng MỌI nơi gọi provider đều dùng hai hằng số này, KHÔNG đọc document.
 * Tên model thì vẫn nhập được ở trang quản trị — đổi model là việc thường ngày.
 */
export const PROVIDER_BASE_URL = "https://api.stali.vn/v1";
export const PROVIDER_LABEL = "Stali";

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
  // chatQuotaPerDay ĐI THEO CÙNG quy ước với quotaStudentPerDay ở trên, KHÔNG PHẢI quy ước
  // ngược của rateLimitPerMinute bên dưới: đây cũng là một NGÂN SÁCH CHI PHÍ (đếm tin nhắn
  // chat của học sinh trong ngày, dùng lại consumeQuota với khoá khác — design spec §6), nên
  // 0 nghĩa là KHÔNG học sinh nào được gửi tin chat trong ngày. Khác quotaStudentPerDay ở chỗ
  // mặc định KHÔNG im lặng (xem DEFAULT_AI_CONFIG bên dưới) vì baseUrl rỗng và killSwitch bật
  // đã tự tắt toàn bộ tính năng AI rồi — chatQuotaPerDay chỉ cần sẵn một ngân sách hợp lý cho
  // thời điểm admin bật tính năng, không cần đóng vai một guard độc lập thứ hai.
  // `.default(30)` (C1 follow-up, final whole-branch review): field này thêm SAU khi document
  // aiConfig gốc đã tồn tại (commit a697953) — CÙNG hình dạng nguy hiểm với
  // crisisEmailEnabled/crisisEmailFrom mà C1 sửa (required, không default, thêm sau khi document
  // gốc đã có). Giá trị khớp DEFAULT_AI_CONFIG bên dưới để hai nguồn không thể lệch nhau.
  chatQuotaPerDay: z.number().int().min(0).default(30),
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
  // Fix round 1 cho Task 5 (Finding 2a — review từ coordinator): rateLimitPerMinute ở TRÊN là
  // của phản chiếu (khoảng cách "vô hình" giữa hai lượt phản chiếu, người dùng không gõ liên
  // tục). Với chat, đó chính là giới hạn CHI PHỐI: rateLimitPerMinute=3 nghĩa là 20 giây giữa
  // hai tin — vô lý cho một cuộc trò chuyện. chatRateLimitPerMinute là phanh chống burst
  // RIÊNG cho chat, cùng quy ước với rateLimitPerMinute (0 = không áp rate limit).
  // `.default(20)` (C1 follow-up, final whole-branch review): field này thêm SAU khi document
  // aiConfig gốc đã tồn tại (commit 40bc825) — cùng lý do chatQuotaPerDay ở trên. Giá trị khớp
  // DEFAULT_AI_CONFIG bên dưới.
  chatRateLimitPerMinute: z.number().int().min(0).default(20),
  killSwitch: z.object({
    // CHÚ Ý CHIỀU: true = tính năng ĐANG TẮT. false = tính năng đang bật.
    // Đọc ngược field này là một lỗi tốn tiền — kiểm tra kỹ trước khi dùng.
    moodReflection: z.boolean(),
    // Fix round 1 cho Task 5 (Finding 2b — ruling của coordinator): một công tắc DUY NHẤT
    // (moodReflection) không thể diễn đạt "phản chiếu bật, chat vẫn khoá" — một admin bật lại
    // phản chiếu (tắt moodReflection) sẽ VÔ TÌNH mở luôn chat cho học sinh, trong khi §10 của
    // design spec CHẶN go-live của chat cho tới khi chuyên gia tâm lý duyệt persona VÀ
    // CRISIS_REPLY_TEXT. `chat` là công tắc RIÊNG, mặc định true (tắt) — cùng quy ước "hệ
    // thống mặc định im lặng" của mọi công tắc khác trong dự án này.
    // `.default(true)` (C1 follow-up): field này thêm SAU document gốc (commit 40bc825), CÙNG
    // hình dạng nguy hiểm với chatQuotaPerDay/chatRateLimitPerMinute/crisisEmailEnabled/
    // crisisEmailFrom — một document cũ thiếu field này giờ fallback về "tắt" (khớp
    // DEFAULT_AI_CONFIG) thay vì làm rớt CẢ document qua safeParse.
    chat: z.boolean().default(true),
  }),
  // ExamCalm Spec #5 (task-1-brief.md): hai field này KHÔNG PHẢI cấu hình AI — chúng cấu hình
  // việc GỬI MAIL khi có crisisAlerts. Đặt trong aiConfig là CỐ Ý, không phải tiện đâu bỏ đó:
  // cảnh báo khủng hoảng chỉ sinh ra từ chat, và chat CẦN AI — nên vòng đời của tính năng gửi
  // mail luôn đi sau vòng đời của AI. Sống chung document với aiConfig cho phép dùng lại NGUYÊN
  // VẸN: test đồng bộ cross-package này (ai-config-sync.test.ts), batch ghi atomic cùng
  // aiPublic (saveAiConfig.ts), firestore.rules đã có, và trang admin đã có. Tách ra một
  // document riêng nghĩa là một rule riêng, một đường đọc riêng, một đường ghi riêng — chi phí
  // đó không đáng cho hai field. ĐỪNG "dọn" hai field này ra document riêng mà không đọc lại
  // đoạn comment này trước.
  // C1 (final whole-branch review): `.default(false)` — production `systemConfig/aiConfig` được
  // ghi TRƯỚC khi hai field này tồn tại, nên tài liệu thật đó THIẾU HẲN chúng (không phải null).
  // Không có default, safeParse THẤT BẠI cho một tài liệu vốn hợp lệ ở mọi field khác, làm rớt
  // CẢ document ở năm điểm đọc (xem functions/src/email/onCrisisAlertCreated.ts,
  // functions/src/ai/sendChatMessage.ts, functions/src/ai/generateReflection.ts,
  // src/lib/firestore/admin-ai.ts, functions/src/admin/saveAiConfig.ts) — một trong số đó
  // (saveAiConfig batch.set) là GHI ĐÈ TOÀN BỘ, không phải merge, nên form trống rơi từ đó có thể
  // XOÁ SẠCH baseUrl/model/quota thật khi admin bấm Lưu. `.default()` không đổi kiểu TypeScript
  // suy ra (field vẫn bắt buộc ở output) — chỉ đổi INPUT của safeParse thành optional.
  crisisEmailEnabled: z.boolean().default(false),
  // "" là sentinel "chưa cấu hình" — cùng quy ước với baseUrl/model ở trên. Rỗng vẫn hợp lệ.
  crisisEmailFrom: z.string().default(""),
  /**
   * Công tắc cho tính năng Confession — mặc định TẮT.
   *
   * Bật Confession tạo ra một nghĩa vụ vận hành liên tục: phải có người đọc
   * hàng chờ duyệt. Mặc định tắt để trường chủ động bật khi đã sắp xếp được
   * người trực, chứ không phải vô tình chạy vì tính năng đã có sẵn trong code.
   *
   * .default(false) vì document aiConfig ghi trước khi có field này thiếu hẳn
   * nó — cùng lý do với crisisEmailEnabled ngay bên trên.
   */
  confessionEnabled: z.boolean().default(false),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;

export const DEFAULT_AI_CONFIG: AiConfig = {
  // Hai field này KHÔNG còn là sentinel "chưa cấu hình" nữa — nhà cung cấp đã
  // đóng cứng trong mã nguồn. Sentinel duy nhất còn lại là `model` rỗng.
  providerLabel: PROVIDER_LABEL,
  baseUrl: PROVIDER_BASE_URL,
  model: "",
  temperature: 0.7,
  maxTokens: 500,
  quotaStudentPerDay: 0,
  // 30, đề xuất của design spec §6 — không cần im lặng như quotaStudentPerDay vì baseUrl
  // rỗng + killSwitch bật đã tắt toàn bộ tính năng AI; giá trị này chỉ có tác dụng sau khi
  // admin bật tính năng.
  chatQuotaPerDay: 30,
  // 3, không phải 0 — 0 ở field này nghĩa là "không rate limit" (xem chú
  // thích ở aiConfigSchema), và một mặc định hệ thống cho một tính năng brake
  // chi phí không nên là "không giới hạn burst". quotaStudentPerDay = 0 đã
  // chặn mọi lượt gọi khi tính năng còn tắt, nên giá trị này chỉ có tác dụng
  // sau khi admin bật tính năng (belt and braces).
  rateLimitPerMinute: 3,
  // 20 lượt/phút (một tin mỗi 3 giây) — đủ nhanh cho một cuộc trò chuyện thật, vẫn là một
  // phanh chống burst (Fix round 1, Task 5, Finding 2a).
  chatRateLimitPerMinute: 20,
  // Mặc định hệ thống là im lặng: kill switch true = tính năng đang tắt. `chat` mặc định
  // true (tắt) — độc lập với moodReflection (Fix round 1, Task 5, Finding 2b).
  killSwitch: { moodReflection: true, chat: true },
  // Spec #5: mặc định TẮT và CHƯA cấu hình — cùng nguyên tắc "hệ thống mặc định im lặng" như
  // mọi field khác ở đây. Admin phải chủ động bật VÀ nhập from thì mail mới gửi (xem Task 2).
  crisisEmailEnabled: false,
  crisisEmailFrom: "",
  confessionEnabled: false,
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

import { describe, it, expect } from "vitest";
import { aiConfigSchema as srcSchema, DEFAULT_AI_CONFIG as srcDefault } from "@/lib/types/ai";
// functions/ không import được từ src/ ở RUNTIME (tsconfig + build tách biệt hoàn toàn cho
// Cloud Functions, xem comment đầu functions/src/ai/config.ts) — nhưng đây là công cụ TEST chạy
// trên máy phát triển, không phải mã chạy production của app Next.js hay của Cloud Function nào,
// nên import chéo bằng đường dẫn tương đối ở ĐÂY là an toàn: nó không lọt vào bundle Next.js
// (next build không đụng tới *.test.ts) và không lọt vào `functions/lib` (tsc của functions/
// biên dịch riêng, không biết gì tới file này).
import {
  aiConfigSchema as functionsSchema,
  DEFAULT_AI_CONFIG as functionsDefault,
  AI_CONFIG_FIELD_KEYS,
} from "../../../functions/src/ai/config";
import {
  CHAT_WINDOW_SIZE as srcChatWindowSize,
  CHAT_MESSAGE_MAX_CHARS as srcChatMessageMaxChars,
} from "@/lib/types/chat";
import {
  CHAT_WINDOW_SIZE as functionsChatWindowSize,
  CHAT_MESSAGE_MAX_CHARS as functionsChatMessageMaxChars,
} from "../../../functions/src/ai/buildChatPrompt";
import { CURRENT_AI_CONSENT_VERSION as srcConsentVersion } from "@/lib/types/ai-consent";
import { CURRENT_AI_CONSENT_VERSION as functionsConsentVersion } from "../../../functions/src/ai/config";

/**
 * Task 13 (R2 — ruling của reviewer trước khi spec bắt đầu): `functions/src/ai/config.ts` là
 * bản MIRROR THỦ CÔNG của `aiConfigSchema` (src/lib/types/ai.ts) — không có cách nào import
 * chéo ở runtime, nên hai bản dễ lệch nhau theo thời gian nếu chỉ một bên được sửa. Test này
 * canh giữ đúng bất biến đó.
 *
 * PHẠM VI — những gì test này BẮT ĐƯỢC:
 *  1. Field bị thêm/xoá ở một trong hai bên (so trực tiếp tập tên field top-level).
 *  2. Field lồng bị thêm/xoá bên trong `killSwitch` (so trực tiếp tập tên field của
 *     `killSwitch.shape`).
 *  3. RÀNG BUỘC bị lệch (vd: `maxTokens` được nới trần lên 3000 ở một bên, hay khoảng hợp lệ của
 *     `temperature` bị đổi) — bằng cách chạy CÙNG một bộ giá trị "probe" (biên hợp lệ/không hợp
 *     lệ đã biết) qua CẢ HAI schema và khẳng định hai bên LUÔN đồng ý (cùng accept hoặc cùng
 *     reject). Nếu một bên đổi ràng buộc mà bên kia không đổi theo, ít nhất một probe sẽ lệch.
 *  4. `DEFAULT_AI_CONFIG` lệch giá trị giữa hai bên (so sánh sâu toàn bộ object).
 *  5. Field lồng MỚI được thêm dưới dạng BẮT BUỘC ở một bên (mọi probe dưới đây đều dùng
 *     `killSwitch: { moodReflection: ... }` KHÔNG kèm field nào khác — nếu một bên thêm một field
 *     con bắt buộc mới, TOÀN BỘ probe sẽ lệch ở bên đó vì thiếu field bắt buộc).
 *
 * PHẠM VI — những gì test này KHÔNG bắt được (nêu rõ theo yêu cầu task-13-brief.md):
 *  - Một field lồng MỚI được thêm dưới dạng TÙY CHỌN (optional) chỉ ở một bên: probe tối thiểu ở
 *    trên vẫn parse thành công ở cả hai bên (field tùy chọn không có cũng hợp lệ), nên không lệch
 *    và không bị phát hiện.
 *  - Field top-level MỚI được thêm dưới dạng tùy chọn ở một bên: tương tự, `Object.keys(shape)`
 *    của test #1 SẼ bắt được (vì so tên field, không quan tâm required/optional) — nhưng nếu có
 *    một cách thêm field mà không hiện trong `.shape` (không có trong thiết kế zod hiện tại) thì
 *    sẽ lọt qua.
 *  - Bất kỳ lệch nào KHÔNG thể hiện qua hành vi `safeParse`/`.shape` (vd: khác nhau về comment,
 *    thứ tự khai báo, hay logic nằm ngoài schema — không có trường hợp nào như vậy hiện tại).
 */

const BASE_VALID: {
  providerLabel: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  quotaStudentPerDay: number;
  chatQuotaPerDay: number;
  rateLimitPerMinute: number;
  chatRateLimitPerMinute: number;
  killSwitch: { moodReflection: boolean; chat: boolean };
} = {
  providerLabel: "DeepSeek",
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  temperature: 0.7,
  maxTokens: 500,
  quotaStudentPerDay: 5,
  chatQuotaPerDay: 30,
  rateLimitPerMinute: 3,
  chatRateLimitPerMinute: 20,
  killSwitch: { moodReflection: true, chat: true },
};

/** Mỗi probe là một override ĐÈ LÊN BASE_VALID cho đúng một field — cố tình chọn giá trị biên
 *  (ngay tại/sát trần, sát 0, sai kiểu) vì đó là nơi một ràng buộc bị nới/siết sẽ lộ ra ngay lập
 *  tức qua kết quả safeParse khác nhau giữa hai schema. */
const PROBES: { label: string; override: Record<string, unknown> }[] = [
  { label: "temperature = -0.01 (dưới biên)", override: { temperature: -0.01 } },
  { label: "temperature = 0 (biên dưới hợp lệ)", override: { temperature: 0 } },
  { label: "temperature = 1 (biên trên hợp lệ)", override: { temperature: 1 } },
  { label: "temperature = 1.01 (trên biên)", override: { temperature: 1.01 } },

  { label: "maxTokens = -1", override: { maxTokens: -1 } },
  // M10 (final whole-branch review): sàn nâng từ 0 lên 1 — max_tokens=0 vẫn đi ra provider và
  // vẫn trừ quota, chỉ trả về rỗng/lỗi (xem src/lib/types/ai.ts). 0 giờ PHẢI bị từ chối.
  { label: "maxTokens = 0 (dưới sàn mới, không còn hợp lệ)", override: { maxTokens: 0 } },
  { label: "maxTokens = 1 (biên dưới hợp lệ)", override: { maxTokens: 1 } },
  { label: "maxTokens = 2000 (trần cứng, hợp lệ)", override: { maxTokens: 2000 } },
  { label: "maxTokens = 2001 (vượt trần cứng — bắt được nếu ai đó nới trần một bên)", override: { maxTokens: 2001 } },
  { label: "maxTokens = 500.5 (không phải số nguyên)", override: { maxTokens: 500.5 } },

  { label: "quotaStudentPerDay = -1", override: { quotaStudentPerDay: -1 } },
  { label: "quotaStudentPerDay = 0 (hợp lệ, nghĩa là tạm khoá)", override: { quotaStudentPerDay: 0 } },
  { label: "quotaStudentPerDay = 2.5 (không phải số nguyên)", override: { quotaStudentPerDay: 2.5 } },

  { label: "chatQuotaPerDay = -1", override: { chatQuotaPerDay: -1 } },
  { label: "chatQuotaPerDay = 0 (hợp lệ, nghĩa là tạm khoá, cùng quy ước quotaStudentPerDay)", override: { chatQuotaPerDay: 0 } },
  { label: "chatQuotaPerDay = 2.5 (không phải số nguyên)", override: { chatQuotaPerDay: 2.5 } },

  { label: "rateLimitPerMinute = -1", override: { rateLimitPerMinute: -1 } },
  { label: "rateLimitPerMinute = 0 (hợp lệ, nghĩa là không rate limit)", override: { rateLimitPerMinute: 0 } },

  // Fix round 1 cho Task 5 (Finding 2a — review từ coordinator): probe mới cho field vừa
  // thêm, cùng quy ước với rateLimitPerMinute.
  { label: "chatRateLimitPerMinute = -1", override: { chatRateLimitPerMinute: -1 } },
  { label: "chatRateLimitPerMinute = 0 (hợp lệ, nghĩa là không rate limit)", override: { chatRateLimitPerMinute: 0 } },

  { label: "baseUrl rỗng (sentinel chưa cấu hình, hợp lệ)", override: { baseUrl: "" } },
  { label: "baseUrl https hợp lệ", override: { baseUrl: "https://api.example.com/v1" } },
  { label: "baseUrl http:// remote (không hợp lệ)", override: { baseUrl: "http://api.example.com/v1" } },
  { label: "baseUrl http://localhost (hợp lệ, ngoại lệ Ollama)", override: { baseUrl: "http://localhost:11434/v1" } },
  { label: "baseUrl http://127.0.0.1 (hợp lệ, ngoại lệ Ollama)", override: { baseUrl: "http://127.0.0.1:11434/v1" } },
  { label: "baseUrl http://localhost.evil.com (lookalike host, không hợp lệ)", override: { baseUrl: "http://localhost.evil.com/v1" } },
  { label: "baseUrl không phải URL", override: { baseUrl: "khong-phai-url" } },

  { label: "killSwitch.moodReflection = true", override: { killSwitch: { moodReflection: true, chat: true } } },
  { label: "killSwitch.moodReflection = false", override: { killSwitch: { moodReflection: false, chat: true } } },
  // Fix round 1 cho Task 5 (Finding 2b — ruling của coordinator): probe mới cho field lồng
  // vừa thêm — đúng rủi ro mà chính doc-comment đầu file này đã cảnh báo trước (mục 5: một
  // field lồng MỚI bắt buộc phải xuất hiện trong MỌI override killSwitch, không chỉ override
  // dành riêng cho nó, nếu không toàn bộ probe khác sẽ lệch vì thiếu field bắt buộc).
  { label: "killSwitch.chat = true", override: { killSwitch: { moodReflection: true, chat: true } } },
  { label: "killSwitch.chat = false", override: { killSwitch: { moodReflection: true, chat: false } } },
];

describe("aiConfigSchema — đồng bộ src/lib/types/ai.ts và functions/src/ai/config.ts", () => {
  it("hai schema có ĐÚNG cùng tập field top-level", () => {
    const srcFields = Object.keys(srcSchema.shape).sort();
    const functionsFields = [...AI_CONFIG_FIELD_KEYS].sort();
    expect(functionsFields).toEqual(srcFields);
  });

  it("hai schema có ĐÚNG cùng tập field lồng bên trong killSwitch", () => {
    const srcKillSwitchFields = Object.keys(srcSchema.shape.killSwitch.shape).sort();
    const functionsKillSwitchFields = Object.keys(functionsSchema.shape.killSwitch.shape).sort();
    expect(functionsKillSwitchFields).toEqual(srcKillSwitchFields);
  });

  it("chấp nhận giống nhau trên một config hợp lệ đầy đủ, và parse ra CÙNG giá trị", () => {
    const srcResult = srcSchema.safeParse(BASE_VALID);
    const functionsResult = functionsSchema.safeParse(BASE_VALID);
    expect(srcResult.success).toBe(true);
    expect(functionsResult.success).toBe(true);
    expect(functionsResult.success && functionsResult.data).toEqual(
      srcResult.success && srcResult.data,
    );
  });

  it.each(PROBES)("cùng quyết định accept/reject cho probe: $label", ({ override }) => {
    const candidate = { ...BASE_VALID, ...override };
    const srcResult = srcSchema.safeParse(candidate);
    const functionsResult = functionsSchema.safeParse(candidate);
    expect(functionsResult.success).toBe(srcResult.success);
  });

  // Sanity của chính bộ probe: nếu HAI schema cùng lệch khỏi ràng buộc gốc theo đúng cùng một
  // hướng (vd: cả hai cùng bị đổi thành maxTokens tối đa 3000), so sánh accept/reject ở trên sẽ
  // KHÔNG bắt được (cả hai vẫn "đồng ý" với nhau, chỉ là đồng ý sai). Khẳng định trực tiếp một
  // vài giá trị KHÔNG hợp lệ này thực sự bị TỪ CHỐI ở phía src/ (đã có test riêng, xem
  // src/lib/types/ai.test.ts) để những probe "phải reject" ở trên thực sự có ý nghĩa, không phải
  // vô tình luôn pass vì cả hai bên đều chấp nhận mọi giá trị.
  it("một vài probe 'phải reject' thực sự bị từ chối (không phải mọi giá trị đều được chấp nhận)", () => {
    expect(srcSchema.safeParse({ ...BASE_VALID, maxTokens: 2001 }).success).toBe(false);
    expect(srcSchema.safeParse({ ...BASE_VALID, maxTokens: 0 }).success).toBe(false);
    expect(srcSchema.safeParse({ ...BASE_VALID, temperature: 1.01 }).success).toBe(false);
    expect(srcSchema.safeParse({ ...BASE_VALID, baseUrl: "http://api.example.com/v1" }).success).toBe(false);
    expect(srcSchema.safeParse({ ...BASE_VALID, chatQuotaPerDay: -1 }).success).toBe(false);
  });

  // M12 (final whole-branch review): test #1 ở trên so AI_CONFIG_FIELD_KEYS với
  // Object.keys(srcSchema.shape) — nếu AI_CONFIG_FIELD_KEYS tự nó lệch khỏi
  // Object.keys(functionsSchema.shape) (vd ai đó thêm field vào functionsSchema mà quên cập
  // nhật hằng số liệt kê field), test #1 vẫn có thể xanh giả nếu hằng số lệch TRÙNG hướng với
  // srcSchema một cách tình cờ, thay vì thật sự phản ánh functionsSchema. So trực tiếp hằng số
  // với schema THẬT của chính nó để đóng khe hở đó.
  it("AI_CONFIG_FIELD_KEYS khớp ĐÚNG Object.keys(functionsSchema.shape) — không lệch khỏi chính schema nó đại diện", () => {
    expect([...AI_CONFIG_FIELD_KEYS].sort()).toEqual(Object.keys(functionsSchema.shape).sort());
  });
});

// Task 4 fix round 1, Finding 4 (review từ coordinator, pre-flight ruling C1): CHAT_WINDOW_SIZE
// và CHAT_MESSAGE_MAX_CHARS là một mirror thủ công thứ hai, CÙNG DẠNG với aiConfigSchema ở
// trên (functions/ không import được src/ ở runtime — xem comment đầu file). Task 1 khai báo
// hai hằng số ở src/lib/types/chat.ts, Task 4 mirror lại ở functions/src/ai/buildChatPrompt.ts
// để dùng — không ai canh giữ hai bản đó đồng bộ cho tới bây giờ. Dùng LẠI đúng file test này
// (theo doctrine đã nêu ở đầu file) thay vì tạo một sync test thứ hai riêng cho chat.
//
// Rủi ro cụ thể nếu lệch: nâng CHAT_MESSAGE_MAX_CHARS chỉ ở phía src/ khiến schema chấp nhận
// tin nhắn dài hơn, được lưu đầy đủ và hiển thị đầy đủ cho học sinh — nhưng sanitizeChatText ở
// functions/ vẫn âm thầm cắt ở trần CŨ trước khi gửi provider. Không lỗi, không log, không test
// đỏ nào khác bắt được — model chỉ trả lời nửa tin nhắn, trông y hệt việc model "lười" trả lời.
describe("CHAT_WINDOW_SIZE / CHAT_MESSAGE_MAX_CHARS — đồng bộ src/lib/types/chat.ts và functions/src/ai/buildChatPrompt.ts", () => {
  it("CHAT_WINDOW_SIZE giống hệt nhau giữa hai bên", () => {
    expect(functionsChatWindowSize).toBe(srcChatWindowSize);
  });

  it("CHAT_MESSAGE_MAX_CHARS giống hệt nhau giữa hai bên", () => {
    expect(functionsChatMessageMaxChars).toBe(srcChatMessageMaxChars);
  });
});

// I4 (final whole-branch review): CURRENT_AI_CONSENT_VERSION là mirror thứ ba, CÙNG DẠNG với
// hai mirror ở trên — src/lib/types/ai-consent.ts khai báo, functions/src/ai/config.ts mirror
// lại để sendChatMessage.ts dùng. Rủi ro cụ thể nếu lệch: nâng version ở phía src/ (đòi hộp
// thoại mới hơn) mà quên nâng ở functions/ sẽ để callable vẫn chấp nhận một đồng ý CŨ mà UI đã
// coi là không đủ — đúng lỗ hổng I4 tồn tại để bịt, tái diễn ở phía server.
describe("CURRENT_AI_CONSENT_VERSION — đồng bộ src/lib/types/ai-consent.ts và functions/src/ai/config.ts", () => {
  it("giống hệt nhau giữa hai bên", () => {
    expect(functionsConsentVersion).toBe(srcConsentVersion);
  });
});

describe("DEFAULT_AI_CONFIG — đồng bộ giá trị giữa hai bên", () => {
  it("giống hệt nhau (deep equal)", () => {
    expect(functionsDefault).toEqual(srcDefault);
  });

  it("cả hai đều tự parse được bằng chính schema của bên mình", () => {
    expect(srcSchema.safeParse(srcDefault).success).toBe(true);
    expect(functionsSchema.safeParse(functionsDefault).success).toBe(true);
  });
});

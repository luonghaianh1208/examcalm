import { describe, expect, it } from "vitest";
import { PROMPT_AUTHORING_NOTES, PROMPT_TEMPLATE_LIBRARY } from "./prompt-template-library";
import { promptTemplateSchema } from "./types/ai";

/**
 * Bản sao danh sách từ cấm ở functions/src/ai/safetyFilter.ts.
 *
 * Chép tay vì hai package không import được của nhau (cùng lý do với
 * ai-config-sync.test.ts). Ở đây chép là ĐỦ AN TOÀN theo một hướng: nếu bản
 * gốc thêm từ mới mà quên đây, test này lỏng đi chứ không bao giờ cho một mẫu
 * chứa từ cấm lọt qua một cách sai — vì bộ lọc thật vẫn chạy trên output.
 */
const BANNED = [
  "rối loạn lo âu", "trầm cảm", "chẩn đoán", "bệnh tâm lý", "triệu chứng",
  "rối loạn", "hội chứng", "tâm thần", "tự kỷ", "sang chấn", "mắc bệnh",
  "bị bệnh", "kê đơn",
];

describe("kho prompt mẫu", () => {
  it("có ít nhất ba mẫu để thầy cô còn có cái mà so sánh", () => {
    expect(PROMPT_TEMPLATE_LIBRARY.length).toBeGreaterThanOrEqual(3);
  });

  it("không có id trùng nhau", () => {
    const ids = PROMPT_TEMPLATE_LIBRARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("mẫu nào cũng có đủ tiêu đề, lời khuyên dùng khi nào, và hai ô nội dung", () => {
    for (const t of PROMPT_TEMPLATE_LIBRARY) {
      expect(t.title.trim(), t.id).not.toBe("");
      expect(t.whenToUse.trim(), t.id).not.toBe("");
      expect(t.systemPrompt.trim(), t.id).not.toBe("");
      expect(t.userTemplate.trim(), t.id).not.toBe("");
    }
  });

  /*
   * Rào chắn quan trọng nhất của file này.
   *
   * Một mẫu chứa từ chẩn đoán sẽ dạy model dùng đúng từ đó, rồi bộ lọc output
   * chặn lại và học sinh nhận về một lỗi chung chung — hỏng theo kiểu khó lần
   * ra nguyên nhân. Chặn ngay từ mẫu rẻ hơn nhiều.
   */
  it("KHÔNG mẫu nào chứa từ chẩn đoán bị cấm", () => {
    for (const t of PROMPT_TEMPLATE_LIBRARY) {
      const text = `${t.title} ${t.whenToUse} ${t.systemPrompt} ${t.userTemplate}`.toLowerCase();
      for (const tu of BANNED) {
        expect(text.includes(tu), `${t.id} chứa từ cấm "${tu}"`).toBe(false);
      }
    }
  });

  // userTemplate không đi qua bất kỳ bước thay thế biến nào — xem buildMoodPrompt.
  // Một mẫu chứa {{...}} sẽ hiện nguyên văn dấu ngoặc cho model đọc.
  it("KHÔNG mẫu nào dùng cú pháp biến thay thế", () => {
    for (const t of PROMPT_TEMPLATE_LIBRARY) {
      expect(t.userTemplate, t.id).not.toMatch(/\{\{|\}\}|\$\{/);
      expect(t.systemPrompt, t.id).not.toMatch(/\{\{|\}\}|\$\{/);
    }
  });

  // Mẫu phải lưu được thật, không chỉ là chữ đẹp.
  it("mọi mẫu đều hợp lệ theo promptTemplateSchema", () => {
    for (const t of PROMPT_TEMPLATE_LIBRARY) {
      const r = promptTemplateSchema.safeParse({
        name: "mood_reflection",
        version: 1,
        status: "draft",
        systemPrompt: t.systemPrompt,
        userTemplate: t.userTemplate,
        updatedBy: "admin-1",
        updatedAt: new Date(),
      });
      expect(r.success, t.id).toBe(true);
    }
  });
});

describe("lời hướng dẫn soạn prompt", () => {
  it("nêu đủ ba điều dễ làm sai nhất", () => {
    expect(PROMPT_AUTHORING_NOTES).toHaveLength(3);
  });

  it("nói rõ không có biến thay thế và cần người thẩm định", () => {
    const all = PROMPT_AUTHORING_NOTES.join(" ").toLowerCase();
    expect(all).toMatch(/không có biến thay thế/);
    expect(all).toMatch(/thẩm định|chuyên môn tâm lý/);
  });
});

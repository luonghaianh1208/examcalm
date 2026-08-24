import { describe, it, expect } from "vitest";
import { checkOutputSafety } from "./safetyFilter";

describe("checkOutputSafety", () => {
  it("case 1: văn bản phản chiếu bình thường → safe: true", () => {
    const result = checkOutputSafety(
      "Hôm nay bạn đã cố gắng rất nhiều. Hãy nghỉ ngơi một chút và hít thở sâu nhé.",
    );
    expect(result).toEqual({ safe: true, reason: null });
  });

  it('case 2: chứa "rối loạn lo âu" → safe: false', () => {
    const result = checkOutputSafety("Có vẻ như bạn đang có dấu hiệu rối loạn lo âu.");
    expect(result.safe).toBe(false);
  });

  it('case 3: chứa "trầm cảm" → safe: false', () => {
    const result = checkOutputSafety("Bạn có thể đang bị trầm cảm.");
    expect(result.safe).toBe(false);
  });

  it('case 4: chứa "chẩn đoán" → safe: false', () => {
    const result = checkOutputSafety("Đây là chẩn đoán của tôi về tình trạng của bạn.");
    expect(result.safe).toBe(false);
  });

  it('case 5: chứa "bệnh tâm lý", "triệu chứng" → safe: false', () => {
    expect(checkOutputSafety("Bạn có thể mắc bệnh tâm lý.").safe).toBe(false);
    expect(checkOutputSafety("Đây là những triệu chứng đáng lo ngại.").safe).toBe(false);
  });

  it("case 6: không phân biệt hoa thường và không phụ thuộc dấu tổ hợp (NFC/NFD)", () => {
    const nfc = "Trầm Cảm".normalize("NFC");
    const nfd = "TRẦM CẢM".normalize("NFD");

    expect(checkOutputSafety(`Có vẻ bạn đang ${nfc}.`).safe).toBe(false);
    expect(checkOutputSafety(`Có vẻ bạn đang ${nfd}.`).safe).toBe(false);
  });

  it('case 7: "không phải chẩn đoán" là disclaimer hợp lệ → safe: true', () => {
    const result = checkOutputSafety(
      "Đây chỉ là một góc nhìn để bạn tham khảo, không phải chẩn đoán y khoa.",
    );
    expect(result).toEqual({ safe: true, reason: null });
  });

  it("case 8: chuỗi rỗng → safe: false với lý do rõ ràng", () => {
    const result = checkOutputSafety("");
    expect(result.safe).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(typeof result.reason).toBe("string");
  });

  it("case 9: reason nêu được từ khoá nào kích hoạt", () => {
    const result = checkOutputSafety("Bạn có thể đang bị trầm cảm.");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("trầm cảm");
  });

  // Fix round 1 — Finding 1 (Critical): danh sách từ khoá quá hẹp, để lọt quasi-chẩn-đoán.
  it("case 10: reviewer bypass — 'hội chứng lo âu' phải bị chặn", () => {
    const result = checkOutputSafety(
      "Bạn có dấu hiệu của hội chứng lo âu nghiêm trọng, nên đi khám ngay.",
    );
    expect(result.safe).toBe(false);
  });

  it("case 11: các từ khoá mới mở rộng — 'tự kỷ', 'sang chấn', 'mắc bệnh' phải bị chặn", () => {
    expect(checkOutputSafety("Có thể bạn đang tự kỷ.").safe).toBe(false);
    expect(checkOutputSafety("Đây có thể là một sang chấn tâm lý.").safe).toBe(false);
    expect(checkOutputSafety("Bạn có thể mắc bệnh này.").safe).toBe(false);
  });

  it("case 12: từ khoá vay mượn tiếng Anh (code-switch) phải bị chặn", () => {
    expect(checkOutputSafety("You may have an anxiety disorder.").safe).toBe(false);
    expect(checkOutputSafety("This looks like depression to me.").safe).toBe(false);
    expect(checkOutputSafety("This is my diagnosis for you.").safe).toBe(false);
    expect(checkOutputSafety("You seem diagnosed already.").safe).toBe(false);
  });

  it("case 13: từ khoá gốc 'rối loạn' bắt được mọi biến thể 'rối loạn X'", () => {
    expect(checkOutputSafety("Có vẻ bạn bị rối loạn lưỡng cực.").safe).toBe(false);
  });

  // Fix round 1 — Finding 2 (Minor): khoảng trắng linh hoạt trong từ khoá nhiều từ.
  it("case 14: xuống dòng giữa hai từ trong một từ khoá vẫn phải bị bắt", () => {
    const result = checkOutputSafety("Bạn có thể đang bị trầm\ncảm.");
    expect(result.safe).toBe(false);
  });

  // Fix round 1 — Finding 3 (Minor): thêm cụm phủ định "không hề " và "chẳng phải ".
  it("case 15: 'không hề' và 'chẳng phải' là phủ định hợp lệ → safe: true", () => {
    expect(checkOutputSafety("Bạn không hề trầm cảm, chỉ là đang mệt mỏi thôi.").safe).toBe(true);
    expect(checkOutputSafety("Đây chẳng phải chẩn đoán, chỉ là một góc nhìn.").safe).toBe(true);
  });

  it("case 16: phạm vi phủ định chỉ áp dụng cho đúng lần xuất hiện được phủ định", () => {
    const result = checkOutputSafety("Đây không phải chẩn đoán. Bạn bị rối loạn lo âu.");
    expect(result.safe).toBe(false);
  });
});

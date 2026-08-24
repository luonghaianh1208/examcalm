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
});

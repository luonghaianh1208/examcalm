import { describe, it, expect } from "vitest";
import { detectCrisisKeywords } from "./crisisDetector";

describe("detectCrisisKeywords", () => {
  it("case 1: trò chuyện bình thường về áp lực thi → detected: false", () => {
    const result = detectCrisisKeywords(
      "Dạo này em học hành mệt mỏi vì sắp thi cuối kỳ, em hơi lo lắng.",
    );
    expect(result).toEqual({ detected: false, severity: null, matched: null });
  });

  it('case 2: "em muốn tự tử" → detected: true, severity: "urgent"', () => {
    const result = detectCrisisKeywords("Em muốn tự tử, em không chịu nổi nữa.");
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("urgent");
    expect(result.matched).toBe("tự tử");
  });

  it('case 3: cụm tuyệt vọng, chưa có ý định → detected: true, severity: "concern"', () => {
    const result = detectCrisisKeywords("Em thấy mình vô dụng, chẳng ai cần em cả.");
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("concern");
    expect(result.matched).toBe("vô dụng");
  });

  it("case 4: NFC/NFD cho cùng một cụm đều bắt được", () => {
    const nfc = "tự tử".normalize("NFC");
    const nfd = "tự tử".normalize("NFD");

    expect(detectCrisisKeywords(`Em muốn ${nfc}.`).detected).toBe(true);
    expect(detectCrisisKeywords(`Em muốn ${nfd}.`).detected).toBe(true);
  });

  it("case 5: hoa/thường, khoảng trắng thừa, xuống dòng giữa cụm đều bắt được", () => {
    expect(detectCrisisKeywords("EM MUỐN TỰ TỬ.").detected).toBe(true);
    expect(detectCrisisKeywords("Em muốn   tự    tử.").detected).toBe(true);
    expect(detectCrisisKeywords("Em muốn tự\ntử.").detected).toBe(true);
  });

  it("case 6: matched nêu đúng cụm kích hoạt, không phải câu gốc của học sinh", () => {
    const result = detectCrisisKeywords("Con không còn muốn sống nữa, con mệt lắm rồi.");
    expect(result.detected).toBe(true);
    expect(result.matched).not.toContain("con mệt lắm rồi");
  });

  it("case 7: chuỗi rỗng → detected: false", () => {
    const result = detectCrisisKeywords("");
    expect(result).toEqual({ detected: false, severity: null, matched: null });
  });

  it("case 8: khi văn bản khớp cả urgent lẫn concern, ưu tiên severity nặng hơn (urgent)", () => {
    const result = detectCrisisKeywords("Em thấy vô dụng và em muốn tự tử.");
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("urgent");
  });

  it("case 9: các phương thức tự hại cụ thể phải bị bắt ở mức urgent", () => {
    expect(detectCrisisKeywords("Em định rạch tay tối nay.").severity).toBe("urgent");
    expect(detectCrisisKeywords("Em nghĩ đến việc nhảy cầu.").severity).toBe("urgent");
    expect(detectCrisisKeywords("Em muốn treo cổ tự tử.").severity).toBe("urgent");
  });

  it("case 10: từ khoá vay mượn tiếng Anh (code-switch) phải bị bắt", () => {
    expect(detectCrisisKeywords("I want to kill myself.").severity).toBe("urgent");
    expect(detectCrisisKeywords("I just want to end my life.").severity).toBe("urgent");
  });

  it("case 11: cụm concern khác (gánh nặng, tuyệt vọng, muốn biến mất) phải bị bắt", () => {
    expect(detectCrisisKeywords("Em thấy mình là gánh nặng cho gia đình.").severity).toBe(
      "concern",
    );
    expect(detectCrisisKeywords("Em thấy tuyệt vọng quá.").severity).toBe("concern");
    expect(detectCrisisKeywords("Em chỉ muốn biến mất khỏi thế giới này.").severity).toBe(
      "concern",
    );
  });

  it("case 12: than thở mệt mỏi thông thường không bị bắt nhầm (từ đơn lẻ không nằm trong danh sách)", () => {
    const result = detectCrisisKeywords("Em mệt mỏi và buồn vì điểm thi không như ý.");
    expect(result.detected).toBe(false);
  });
});

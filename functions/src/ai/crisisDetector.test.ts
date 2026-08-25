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

  // Fix round 1, Finding 7: assertion cũ (`not.toContain(...)`) không thể fail — một
  // implementation trả về `matched: text.slice(0, 20)` vẫn pass. Assert đúng giá trị cụ thể.
  it("case 6: matched nêu đúng cụm kích hoạt, không phải câu gốc của học sinh", () => {
    const result = detectCrisisKeywords("Con không còn muốn sống nữa, con mệt lắm rồi.");
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("urgent");
    expect(result.matched).toBe("không còn muốn sống");
  });

  // Fix round 1, Finding 7: implementation không còn nhánh đặc biệt cho chuỗi rỗng — "" tự
  // nhiên rơi qua mọi pattern (không cụm nào khớp chuỗi rỗng). Test này giữ lại như một
  // regression test, không phải để xác nhận một nhánh code riêng.
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

  // Fix round 1, Finding 7: chỉ "tự tử" từng có test cho khoảng trắng linh hoạt — bổ sung cho
  // một cụm tiếng Anh nhiều từ và một cụm mức concern.
  it("case 13: khoảng trắng linh hoạt cho cụm khoá tiếng Anh nhiều từ", () => {
    const result = detectCrisisKeywords("I want to kill\nmyself   sometimes.");
    expect(result.detected).toBe(true);
    expect(result.matched).toBe("kill myself");
  });

  it("case 14: khoảng trắng linh hoạt cho cụm khoá mức concern", () => {
    const result = detectCrisisKeywords("Em không   còn\nhy vọng gì nữa.");
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("concern");
    expect(result.matched).toBe("không còn hy vọng");
  });
});

// Fix round 1, Finding 1 (CRITICAL): học sinh gõ điện thoại bỏ dấu thanh hoặc viết tắt là
// chuyện thường ngày, không phải edge case — đây là lỗ hổng ở tầng cơ chế, không phải lỗ hổng
// danh sách. Mỗi dòng dưới đây từng trả detected: false trước khi sửa.
describe("gõ điện thoại bỏ dấu / viết tắt teen (Fix round 1, Finding 1)", () => {
  const rows: ReadonlyArray<[string, string]> = [
    ["em muon tu tu qua", "tự tử"],
    ["e muon chet", "muốn chết"],
    ["e ko muon song nua", "không muốn sống nữa"],
    ["em ko muốn sống nữa", "không muốn sống nữa"],
    ["e k muốn sống nữa r", "không muốn sống nữa"],
    ["e hok muốn sống nữa", "không muốn sống nữa"],
    ["em ko mún sống nữa", "không muốn sống nữa"],
  ];

  it.each(rows)("%s → detected: true, severity: urgent, matched: %s", (text, expectedMatched) => {
    const result = detectCrisisKeywords(text);
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("urgent");
    expect(result.matched).toBe(expectedMatched);
  });
});

// Fix round 1, Finding 2 (CRITICAL): các nhóm biểu đạt hoàn toàn vắng mặt trước đây, bao gồm
// các phương thức đặc thù ở Việt Nam. Test theo mẫu đại diện từng nhóm, không lặp lại toàn bộ
// danh sách — danh sách đầy đủ và lý do từng cụm nằm trong task-3-report.md cho chuyên gia
// tâm lý rà soát.
describe("các nhóm cụm mới bổ sung (Fix round 1, Finding 2)", () => {
  it("nhóm ý định gián tiếp", () => {
    expect(detectCrisisKeywords("Em chỉ muốn kết thúc tất cả.").severity).toBe("urgent");
    expect(detectCrisisKeywords("Dạo này em chán đời lắm.").severity).toBe("urgent");
  });

  it("nhóm lời từ biệt", () => {
    expect(detectCrisisKeywords("Em muốn viết thư tuyệt mệnh.").severity).toBe("urgent");
    expect(detectCrisisKeywords("Em chào tạm biệt mọi người ở đây.").severity).toBe("urgent");
  });

  it("nhóm phương thức đặc thù Việt Nam (thuốc diệt cỏ/thuốc sâu, thắt cổ)", () => {
    expect(detectCrisisKeywords("Em định uống thuốc diệt cỏ.").severity).toBe("urgent");
    expect(detectCrisisKeywords("Nhà em có thuốc sâu, em định uống.").severity).toBe("urgent");
    expect(detectCrisisKeywords("Em nghĩ đến việc thắt cổ.").severity).toBe("urgent");
  });

  it("nhóm cảm giác là gánh nặng (perceived burdensomeness) — mức concern", () => {
    expect(detectCrisisKeywords("Chắc tốt hơn nếu không có em.").severity).toBe("concern");
    expect(detectCrisisKeywords("Không có em thì cả nhà đỡ khổ hơn nhiều.").severity).toBe(
      "concern",
    );
  });
});

// Fix round 1, Finding 3 (Important): danh sách tiếng Anh cũ chỉ có "suicide" (substring
// literal) nên bỏ sót "suicidal"; và bỏ sót các từ lóng né bộ lọc phổ biến nhất hiện nay.
describe("tiếng Anh: gốc từ và từ lóng né bộ lọc (Fix round 1, Finding 3)", () => {
  it('gốc từ "suicid" bắt được cả "suicidal"', () => {
    expect(detectCrisisKeywords("I've been feeling suicidal lately.").severity).toBe("urgent");
  });

  it('từ lóng né bộ lọc phổ biến: "unalive", "kms"', () => {
    expect(detectCrisisKeywords("ngl i wanna unalive myself").severity).toBe("urgent");
    expect(detectCrisisKeywords("might just kms tonight ngl").severity).toBe("urgent");
  });
});

// Fix round 1, Finding 4 (CRITICAL): "X muốn chết" là cấu trúc tăng cường độ productive, gắn
// được vào bất kỳ tính từ trạng thái nào, và xuất hiện tự nhiên trong đúng use-case chính của
// app. Vì Lớp 1 khớp thì model không được gọi nữa (§3.1), báo nhầm ở đây chặn luôn một cuộc
// trò chuyện bình thường — khác với báo nhầm "concern" (không chặn model).
describe('"muốn chết" — loại trừ cấu trúc tăng cường, giữ nguyên ý định thật (Fix round 1, Finding 4)', () => {
  it("cấu trúc tăng cường 'X muốn chết' không bị bắt", () => {
    expect(detectCrisisKeywords("Đề toán khó muốn chết luôn chị ạ.").detected).toBe(false);
    expect(detectCrisisKeywords("Em học mệt muốn chết, mai còn thi Lý.").detected).toBe(false);
    expect(detectCrisisKeywords("Trời nóng muốn chết mà vẫn phải đi học.").detected).toBe(false);
    expect(detectCrisisKeywords("Buồn cười muốn chết, thằng bạn em ngủ gật.").detected).toBe(
      false,
    );
  });

  it("'muốn chết' đứng một mình hoặc sau chủ ngữ vẫn phải bị bắt ở mức urgent", () => {
    expect(detectCrisisKeywords("Em muốn chết.").severity).toBe("urgent");
    expect(detectCrisisKeywords("Con muốn chết quá.").severity).toBe("urgent");
    expect(detectCrisisKeywords("Tao muốn chết.").severity).toBe("urgent");
  });

  // Fix round 1, Finding 6: phủ định KHÔNG được loại trừ — đây là điểm khác biệt cố ý so với
  // guard tăng cường ở trên. Một tuyên bố ambivalent thật ("không muốn chết, chỉ muốn mọi thứ
  // dừng lại") vẫn phải kích hoạt.
  it("phủ định trước 'muốn chết' vẫn phải bị bắt (không phải guard tăng cường)", () => {
    const result = detectCrisisKeywords("Em không muốn chết, em chỉ muốn mọi thứ dừng lại.");
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("urgent");
  });
});

// Fix round 1, Finding 5 (Important): ba nhóm báo nhầm cùng hình dạng — một cụm ngắn mang
// nghĩa nguy hiểm collide với cách dùng đời thường hoàn toàn vô hại.
describe("ba nhóm báo nhầm cùng hình dạng (Fix round 1, Finding 5)", () => {
  it("'không muốn sống ở/với X' không còn bị bắt nhầm (đã bỏ dạng trần 'không muốn sống')", () => {
    expect(detectCrisisKeywords("Em không muốn sống ở ký túc xá nữa.").detected).toBe(false);
  });

  it("'cắt tay áo' và tai nạn khi gọt hoa quả không bị bắt nhầm", () => {
    expect(detectCrisisKeywords("Cắt tay áo ngắn đi cho mát.").detected).toBe(false);
    expect(detectCrisisKeywords("Hôm qua em cắt tay khi gọt hoa quả.").detected).toBe(false);
  });

  it("'nhảy cầu lông' (môn thể thao) không bị bắt nhầm", () => {
    expect(detectCrisisKeywords("Em đi nhảy cầu lông ở nhà thi đấu.").detected).toBe(false);
  });
});

// Fix round 1, Finding 8 (Minor): bốn entry từng bị một entry ngắn hơn trong cùng mảng che
// khuất trong `matched` (phát hiện vẫn đúng, chỉ tín hiệu hiệu chỉnh cho admin bị suy giảm) —
// đã gỡ các entry dài dư thừa. Xác nhận phát hiện không bị ảnh hưởng.
describe("entry dư thừa đã gỡ vẫn được bắt qua entry ngắn hơn chứa nó (Fix round 1, Finding 8)", () => {
  it("'uống thuốc tự tử' vẫn bắt được qua 'tự tử'", () => {
    const result = detectCrisisKeywords("Em định uống thuốc tự tử tối nay.");
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("urgent");
    expect(result.matched).toBe("tự tử");
  });

  it("'muốn biến mất khỏi thế giới' vẫn bắt được qua 'muốn biến mất'", () => {
    const result = detectCrisisKeywords("Em chỉ muốn biến mất khỏi thế giới này.");
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("concern");
    expect(result.matched).toBe("muốn biến mất");
  });
});

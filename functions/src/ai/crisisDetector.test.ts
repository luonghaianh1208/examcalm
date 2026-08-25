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
  // Fix round 2, Finding 5: thêm assertion `matched` để một mis-attribution trong tương lai
  // (VD entry mới che khuất entry cũ, hoặc ngược lại) bị bắt ngay ở đây thay vì chỉ được phát
  // hiện qua rà soát thủ công.
  it("nhóm ý định gián tiếp", () => {
    const ketThuc = detectCrisisKeywords("Em chỉ muốn kết thúc tất cả.");
    expect(ketThuc.severity).toBe("urgent");
    expect(ketThuc.matched).toBe("kết thúc tất cả");

    const chanDoi = detectCrisisKeywords("Dạo này em chán đời lắm.");
    expect(chanDoi.severity).toBe("urgent");
    expect(chanDoi.matched).toBe("chán đời");
  });

  it("nhóm lời từ biệt", () => {
    const thuTuyetMenh = detectCrisisKeywords("Em muốn viết thư tuyệt mệnh.");
    expect(thuTuyetMenh.severity).toBe("urgent");
    expect(thuTuyetMenh.matched).toBe("thư tuyệt mệnh");

    const tamBiet = detectCrisisKeywords("Em chào tạm biệt mọi người ở đây.");
    expect(tamBiet.severity).toBe("urgent");
    expect(tamBiet.matched).toBe("chào tạm biệt mọi người");
  });

  it("nhóm phương thức đặc thù Việt Nam (thuốc diệt cỏ/thuốc sâu, thắt cổ)", () => {
    const dietCo = detectCrisisKeywords("Em định uống thuốc diệt cỏ.");
    expect(dietCo.severity).toBe("urgent");
    expect(dietCo.matched).toBe("thuốc diệt cỏ");

    const thuocSau = detectCrisisKeywords("Nhà em có thuốc sâu, em định uống.");
    expect(thuocSau.severity).toBe("urgent");
    expect(thuocSau.matched).toBe("thuốc sâu");

    const thatCo = detectCrisisKeywords("Em nghĩ đến việc thắt cổ.");
    expect(thatCo.severity).toBe("urgent");
    expect(thatCo.matched).toBe("thắt cổ");
  });

  it("nhóm cảm giác là gánh nặng (perceived burdensomeness) — mức concern", () => {
    const totHon = detectCrisisKeywords("Chắc tốt hơn nếu không có em.");
    expect(totHon.severity).toBe("concern");
    expect(totHon.matched).toBe("tốt hơn nếu không có em");

    const doKho = detectCrisisKeywords("Không có em thì cả nhà đỡ khổ hơn nhiều.");
    expect(doKho.severity).toBe("concern");
    expect(doKho.matched).toBe("không có em thì ... đỡ khổ");
  });
});

// Fix round 1, Finding 3 (Important): danh sách tiếng Anh cũ chỉ có "suicide" (substring
// literal) nên bỏ sót "suicidal"; và bỏ sót các từ lóng né bộ lọc phổ biến nhất hiện nay.
describe("tiếng Anh: gốc từ và từ lóng né bộ lọc (Fix round 1, Finding 3)", () => {
  it('gốc từ "suicid" bắt được cả "suicidal"', () => {
    expect(detectCrisisKeywords("I've been feeling suicidal lately.").severity).toBe("urgent");
  });

  it('từ lóng né bộ lọc phổ biến: "unalive"', () => {
    expect(detectCrisisKeywords("ngl i wanna unalive myself").severity).toBe("urgent");
  });

  // "kms" hạ xuống mức concern ở Fix round 3, Finding 2 — xem describe riêng "kms hạ xuống mức
  // concern" bên dưới.
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

// Fix round 2, Finding 1 (CRITICAL): cơ chế bỏ dấu cả câu ở Fix round 1 gộp mất thanh điệu —
// "từ từ" (chầm chậm, có dấu ĐÚNG) bị strip trùng với "tự tử" đã strip. Năm dòng dưới đây đều
// là văn bản có dấu ĐẦY ĐỦ và ĐÚNG của học sinh, không liên quan khủng hoảng — từng bị báo
// nhầm ở mức urgent trước khi sửa. Quan trọng nhất: "tư vấn" (counselling) bị đọc thành "tự
// vẫn" — một học sinh xin app tư vấn lại nhận về tổng đài khủng hoảng.
describe("gộp nhầm thanh điệu do bỏ dấu cả câu (Fix round 2, Finding 1)", () => {
  const falsePositives = [
    "Chị ơi em ôn từ từ có kịp không?",
    "Em muốn được tư vấn về việc chọn trường",
    "Nói thật cô giáo em cũng không hiểu bài",
    "Lớp em hôm nay trực treo cờ ở sân trường",
    "Bạn Vinh biết điểm rồi",
  ];

  it.each(falsePositives)("%s → detected: false", (text) => {
    expect(detectCrisisKeywords(text).detected).toBe(false);
  });

  // So khớp bỏ dấu vẫn phải hoạt động ở CẤP TỪ khi văn bản mix có dấu/không dấu — trường hợp
  // rất phổ biến khi học sinh gõ điện thoại (chỉ một từ bị thiếu dấu, không phải cả câu).
  it("văn bản mix có dấu/không dấu vẫn bắt được đúng từ thiếu dấu", () => {
    const result = detectCrisisKeywords("em muon chết");
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("urgent");
    expect(result.matched).toBe("muốn chết");
  });
});

// Fix round 3, Finding 1 (Important, gần Critical): `\b` của Fix round 2 chỉ vô tình đủ an
// toàn cho từ NẰM GIỮA một cụm (nhờ `\s+` bắt buộc theo sau) — từ CUỐI CÙNG của một cụm thì
// không có gì bắt buộc theo sau để chặn, và `\b` coi việc chuyển từ ASCII sang ký tự có dấu là
// một boundary hợp lệ dù đó vẫn là MỘT âm tiết. "gì" bỏ dấu thành "gi", và "gi" khớp được ngay
// đầu "giàu"/"giáo"/"giấy"/"giữa"/"giường"/"giỏi". Đây là ví dụ thật, ngữ pháp bình thường học
// sinh sẽ gõ.
describe("ranh giới \\b không đủ cho từ cuối cùng của một cụm (Fix round 3, Finding 1)", () => {
  const falsePositives = [
    // "gì" → "gi" khớp nhầm đầu "giàu" — ví dụ nghiêm trọng nhất: câu bình thường đáng ra
    // không liên quan gì tới khủng hoảng.
    "Sống để làm giàu thôi chị.",
    "Bố em bảo sống để làm giàu.",
    "Bạn ấy học giỏi nhất lớp.",
    "Cô giáo em rất tốt.",
    "Tờ giấy này của em.",
    "Ở giữa lớp có một cái bàn.",
    "Cái giường này êm quá.",
    // "ngủ" → "ngu" khớp nhầm đầu "nguồn".
    "Thuốc nguồn gốc rõ ràng thì mới nên mua.",
    // "tử"/"tự" → "tu" khớp nhầm đầu "tuổi"/"tuần".
    "Em mười tám tuổi.",
    "Tuần sau em thi rồi.",
  ];

  it.each(falsePositives)("%s → detected: false", (text) => {
    expect(detectCrisisKeywords(text).detected).toBe(false);
  });

  // Cùng những từ đó, khi đứng đúng làm MỘT TỪ RIÊNG (có ranh giới thật ở cả hai đầu), vẫn phải
  // bị bắt — sửa lỗ hổng không được làm mất khả năng phát hiện thật.
  it("cùng các từ đó vẫn bắt đúng khi là một từ riêng, có ranh giới thật", () => {
    expect(detectCrisisKeywords("Sống để làm gì nữa hả chị.").severity).toBe("urgent");
    expect(detectCrisisKeywords("Em định uống thuốc ngủ.").severity).toBe("urgent");
    expect(detectCrisisKeywords("Em muốn tự tử.").severity).toBe("urgent");
  });
});

// Fix round 2, Finding 2 (Important): pattern trước đây là substring thô, không có ranh giới
// từ — "k"/"kg" khớp được giữa chừng "Ok"/"50kg". Bốn dòng đầu từng bị báo nhầm.
describe("thiếu ranh giới từ (word boundary) cho biến thể ASCII ngắn (Fix round 2, Finding 2)", () => {
  const falsePositives = [
    "Ok ai quan tâm điểm của em đâu",
    "Thôi ok ai yêu em đâu",
    "50kg ai cần thì lấy",
    "Em vừa chạy bộ được 3 kms",
  ];

  it.each(falsePositives)("%s → detected: false", (text) => {
    expect(detectCrisisKeywords(text).detected).toBe(false);
  });

  // "kms" hạ xuống mức concern ở Fix round 3, Finding 2 (xem describe riêng bên dưới) — vẫn
  // phải được bắt (ở mức concern), guard số chỉ loại trừ đúng mẫu "số + kms".
  it("'kms' (tiếng lóng, không có số đứng trước) vẫn phải bị bắt ở mức concern", () => {
    expect(detectCrisisKeywords("might just kms tonight ngl").severity).toBe("concern");
  });

  // "cutting" bị gỡ khỏi URGENT_KEYWORDS (quyết định có chủ đích, xem comment tại Nhóm 9 trong
  // crisisDetector.ts) — quá nhiều cách dùng đời thường vô hại để làm tín hiệu đơn lẻ đáng tin.
  it("'cutting' không còn là từ khoá — 'cutting edge' không bị bắt", () => {
    expect(detectCrisisKeywords("cutting edge technology").detected).toBe(false);
  });
});

// Fix round 3, Finding 2 (Important): guard số của "kms" chỉ loại trừ được mẫu "số + kms"
// ("chạy được 3 kms") — không loại trừ được cách dùng đơn vị khác không kèm số cụ thể ("chạy
// vài kms nữa"). Sau Fix round 2, chỉ "urgent" mới chặn model, nên một token có độ đặc hiệu
// thấp và dư thừa với "kill myself"/"unalive"/gốc từ "suicid" như "kms" không đáng ở mức chặn
// hội thoại — quyết định: HẠ xuống CONCERN_KEYWORDS thay vì xây guard "phải đứng gần đại từ tự
// xưng" (cùng lý do đã dẫn tới quyết định gỡ "cutting" ở Fix round 2: một cơ chế mới chỉ để cứu
// một từ không đáng công sức khi hạ mức đã đủ giải quyết vấn đề).
describe('"kms" hạ xuống mức concern (Fix round 3, Finding 2)', () => {
  it("'kms' không có số đứng trước vẫn phải bị bắt, nhưng chỉ ở mức concern", () => {
    const result = detectCrisisKeywords("Em chạy vài kms nữa thôi.");
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("concern");
    expect(result.matched).toBe("kms");
  });

  // Guard số cho mẫu "số + kms" đã có test riêng ở describe "thiếu ranh giới từ..." (Fix
  // round 2, Finding 2) — "Em vừa chạy bộ được 3 kms" vẫn detected: false.
});

// Fix round 1, Finding 4 từng liệt kê 23 từ tăng cường cho "X muốn chết" — nhưng bỏ sót đúng
// từ vựng của use-case chính app (áp lực thi cử). Bảy dòng dưới đây từng bị báo nhầm.
describe('"muốn chết" thiếu từ vựng áp lực thi cử (Fix round 2, Finding 3)', () => {
  const falsePositives = [
    "Áp lực muốn chết",
    "Căng thẳng muốn chết",
    "Stress muốn chết",
    "Xấu hổ muốn chết",
    "Ngượng muốn chết",
    "Bực muốn chết",
    "Hồi hộp muốn chết",
  ];

  it.each(falsePositives)("%s → detected: false", (text) => {
    expect(detectCrisisKeywords(text).detected).toBe(false);
  });
});

// Fix round 2, Finding 5 (Minor): "cắt tay" trước đó chỉ có test khẳng định false (guard) —
// xoá nó khỏi URGENT_KEYWORDS thử nghiệm sẽ không làm fail test nào, chứng tỏ thiếu test
// dương tính. Bổ sung test dương tính, và mở rộng sang các biến thể gõ tắt/bỏ dấu chưa có test
// ("hông", "kg", "mong").
describe("bổ sung test dương tính còn thiếu (Fix round 2, Finding 5)", () => {
  it("'cắt tay' trong ngữ cảnh tự hại thật vẫn phải bị bắt", () => {
    const result = detectCrisisKeywords("Em vừa cắt tay xong, máu chảy nhiều lắm.");
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("urgent");
    expect(result.matched).toBe("cắt tay");
  });

  it("'hông' (biến thể gõ tắt của 'không') chưa có test trước đây", () => {
    const result = detectCrisisKeywords("Em hông muốn sống nữa.");
    expect(result.detected).toBe(true);
    expect(result.matched).toBe("không muốn sống nữa");
  });

  it("'kg' (biến thể gõ tắt của 'không') chưa có test trước đây", () => {
    const result = detectCrisisKeywords("Em kg muốn sống nữa rồi.");
    expect(result.detected).toBe(true);
    expect(result.matched).toBe("không muốn sống nữa");
  });

  it("'mong' (biến thể gõ tắt của 'muốn') chưa có test trước đây", () => {
    const result = detectCrisisKeywords("Em không mong sống nữa.");
    expect(result.detected).toBe(true);
    expect(result.matched).toBe("không muốn sống nữa");
  });
});

// Fix round 2, Finding 6 (Minor): TEEN_ABBREVIATIONS/PHRASE_GUARDS trước đây là object literal
// — tra cứu với key trùng tên thuộc tính kế thừa từ Object.prototype ("constructor",
// "toString", "valueOf"...) có thể trả về một hàm thay vì undefined. Chuyển sang Map để loại bỏ
// rủi ro này (giữ như defence-in-depth).
//
// Fix round 3 (mục nhỏ, theo re-review): bài test từng đứng ở đây ("văn bản chứa
// 'constructor toString valueOf hasOwnProperty' không ném lỗi") PASS cả khi revert lại object
// literal — vì nó không hề kiểm chứng lỗ hổng: key tra cứu trong TEEN_ABBREVIATIONS.get(word)/
// PHRASE_GUARDS.get(normalizedKeyword) LUÔN LUÔN là một từ tách ra từ chính URGENT_KEYWORDS/
// CONCERN_KEYWORDS (hằng số do ta viết), KHÔNG BAO GIỜ là văn bản người dùng nhập — văn bản
// người dùng chỉ đóng vai trò là chuỗi bị QUÉT TÌM sự xuất hiện của từ khoá, không bao giờ trở
// thành chính cái key được tra cứu. Nói cách khác: lớp lỗi object-literal-prototype-pollution
// không thể xảy ra được ở đường dẫn dữ liệu này, bất kể văn bản người dùng chứa gì. Xoá bài test
// vô nghĩa đó thay vì giữ một "bằng chứng" giả — Map vẫn giữ lại vì không tốn gì để giữ, và
// phòng trường hợp một maintainer sau này định tuyến dữ liệu khác (không phải từ khoá cố định)
// qua cùng cơ chế tra cứu.

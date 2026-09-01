import { describe, expect, it } from "vitest";
import { FAQ, FALLBACK_ANSWER, matchFaq, normalizeQuestion } from "./webAppFaq";

/**
 * Bốn câu gợi ý hiển thị ở giao diện (ChatWindow). Chép ở đây có chủ đích: nếu
 * ai đó đổi từ khoá trong FAQ mà quên các nút gợi ý, test này đỏ ngay — thay
 * vì học sinh bấm đúng nút mà bot trả lời "mình không hiểu".
 */
const CAU_GOI_Y_TRONG_UI = [
  "Nhật ký ở đâu?",
  "Làm sao xem lại kết quả?",
  "Ai đọc được nhật ký của tôi?",
  "Làm sao xoá dữ liệu của tôi?",
];

describe("normalizeQuestion", () => {
  it("bỏ dấu để học sinh gõ không dấu vẫn khớp", () => {
    expect(normalizeQuestion("Nhật ký ở đâu?")).toBe("nhat ky o dau?");
  });

  it("chuyển đ thành d", () => {
    expect(normalizeQuestion("Đâu")).toBe("dau");
  });

  it("gộp khoảng trắng thừa", () => {
    expect(normalizeQuestion("  nhật    ký  ")).toBe("nhat ky");
  });
});

describe("matchFaq", () => {
  it("trả lời được câu hỏi trong chính phản hồi của học sinh", () => {
    expect(matchFaq("Nhật ký ở đâu?").matchedId).toBe("nhat-ky");
    expect(matchFaq("Làm sao xem lại kết quả?").matchedId).toBe("xem-ket-qua");
  });

  it("gõ không dấu vẫn khớp", () => {
    expect(matchFaq("nhat ky o dau").matchedId).toBe("nhat-ky");
  });

  // Chọn từ khoá DÀI NHẤT chứ không phải mục đầu tiên khớp — nếu không, thứ tự
  // khai báo trong mảng lại quyết định câu trả lời.
  it("từ khoá cụ thể hơn thắng từ khoá chung", () => {
    expect(matchFaq("bài tập CBT làm sao?").matchedId).toBe("bai-tap-cbt");
  });

  it("câu hỏi ngoài phạm vi rơi vào câu trả lời giới hạn, không bịa", () => {
    const r = matchFaq("Thủ đô nước Pháp là gì?");
    expect(r.matchedId).toBeNull();
    expect(r.answer).toBe(FALLBACK_ANSWER);
    expect(r.href).toBeUndefined();
  });

  it("câu rỗng cũng rơi vào câu trả lời giới hạn", () => {
    expect(matchFaq("   ").matchedId).toBeNull();
  });

  it("mọi câu gợi ý hiển thị ở giao diện đều có câu trả lời thật", () => {
    for (const cau of CAU_GOI_Y_TRONG_UI) {
      expect(matchFaq(cau).matchedId, `"${cau}" không khớp mục nào`).not.toBeNull();
    }
  });
});

describe("dữ liệu FAQ", () => {
  it("không có id trùng nhau", () => {
    expect(new Set(FAQ.map((e) => e.id)).size).toBe(FAQ.length);
  });

  it("từ khoá đã ở dạng bỏ dấu, chữ thường", () => {
    for (const e of FAQ) {
      for (const kw of e.keywords) {
        expect(normalizeQuestion(kw), `${e.id}: "${kw}" chưa chuẩn hoá`).toBe(kw);
      }
    }
  });

  it("mục nào có nhãn nút thì phải có đường dẫn kèm theo", () => {
    for (const e of FAQ) {
      if (e.hrefLabel) expect(e.href, `${e.id} có nhãn nhưng thiếu href`).toBeTruthy();
      if (e.href) expect(e.hrefLabel, `${e.id} có href nhưng thiếu nhãn`).toBeTruthy();
    }
  });

  // Guideline §6.2: khong chan doan, khong thay chuyen gia.
  it("không có câu trả lời nào mang giọng chẩn đoán", () => {
    for (const e of FAQ) {
      expect(e.answer).not.toMatch(/bạn (đang )?(bị|mắc)\s/i);
    }
  });
});

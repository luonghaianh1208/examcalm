/**
 * Bộ câu trả lời cho bề mặt "Hỏi về web app".
 *
 * Brand Guideline §6.2 giới hạn phạm vi ở: điều hướng, cách dùng tính năng,
 * tài khoản, cài đặt, quyền riêng tư, dữ liệu và xử lý lỗi trong web app. Nó
 * cũng yêu cầu "trả lời ngắn; ưu tiên deep link hoặc CTA tới đúng màn hình" —
 * mô tả đó chính là một FAQ có điều hướng, không cần mô hình ngôn ngữ.
 *
 * VÌ SAO KHÔNG DÙNG AI Ở ĐÂY (quyết định 1c của chủ sản phẩm):
 *   - Chạy được ngay cả khi chưa cắm API key thật.
 *   - Không tiêu hạn mức AI của học sinh cho một câu hỏi về cách dùng web.
 *   - Không bịa. Một mô hình được hỏi "Nhật ký ở đâu?" có thể trả lời trôi
 *     chảy nhưng sai đường dẫn; danh sách này thì không thể sai.
 *
 * Câu hỏi ngoài phạm vi KHÔNG được đoán bừa — xem FALLBACK_ANSWER.
 */

export type FaqEntry = {
  id: string;
  /** Từ khoá kích hoạt, đã bỏ dấu. Khớp khi câu hỏi CHỨA cụm này. */
  keywords: string[];
  answer: string;
  /** Đường dẫn trong app để hiện thành nút. */
  href?: string;
  hrefLabel?: string;
};

/**
 * Bỏ dấu tiếng Việt: học sinh gõ nhanh trên điện thoại thường không bỏ dấu.
 *
 * đ/Đ KHÔNG phân rã theo NFD nên phải xử lý riêng — thiếu bước đó thì "dang o
 * dau" không khớp được với từ khoá "đang ở đâu".
 */
export function normalizeQuestion(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

export const FAQ: FaqEntry[] = [
  {
    id: "nhat-ky",
    keywords: ["nhat ky", "ghi cam xuc", "viet cam xuc", "ghi nhat ky"],
    answer:
      "Nhật ký cảm xúc nằm ở mục “Nhật ký cảm xúc” trong menu. Bạn ghi ngay trên trang đó, " +
      "hoặc bấm hình Meo ở góc màn hình để ghi nhanh từ bất kỳ trang nào.",
    href: "/nhat-ky",
    hrefLabel: "Mở Nhật ký cảm xúc",
  },
  {
    id: "xem-ket-qua",
    keywords: ["xem lai ket qua", "ket qua", "diem cua toi", "lich su lam bai", "da lam gi"],
    answer:
      "Kết quả các lần làm bài và ghi nhật ký nằm ở Dashboard. Ở đó có cả biểu đồ xu hướng " +
      "theo 7, 30 hoặc 90 ngày.",
    href: "/tien-trinh",
    hrefLabel: "Mở Dashboard",
  },
  {
    id: "lam-bai-kiem-tra",
    keywords: ["bai kiem tra", "lam test", "bai test", "gad", "thang do"],
    answer:
      "Bài kiểm tra nằm ở mục “Bài kiểm tra”. Trước khi bắt đầu bạn sẽ thấy bài mất khoảng " +
      "bao lâu, có bao nhiêu câu và đã được chuyên gia thẩm định hay chưa.",
    href: "/test",
    hrefLabel: "Xem bài kiểm tra",
  },
  {
    id: "bai-tap-cbt",
    keywords: ["cbt", "bai tap", "bai thuc hanh"],
    answer:
      "Bài tập CBT là những bài ngắn giúp bạn nhìn lại một suy nghĩ đang làm mình lo. " +
      "Mỗi bài ghi rõ mất khoảng bao nhiêu phút và có mấy bước.",
    href: "/cbt",
    hrefLabel: "Xem bài tập CBT",
  },
  {
    id: "thu-vien",
    keywords: ["thu vien", "bai viet", "tim bai", "tim kiem"],
    answer:
      "Thư viện có ô tìm kiếm ở đầu trang; bạn gõ không dấu cũng tìm được. Các chip bên dưới " +
      "lọc theo chủ đề, và chip “Đã lưu” hiện những bài bạn đã bấm lưu.",
    href: "/thu-vien",
    hrefLabel: "Mở Thư viện",
  },
  {
    id: "da-luu",
    keywords: ["da luu", "luu bai", "bai da luu", "yeu thich"],
    answer:
      "Bài bạn bấm lưu nằm ở chip “Đã lưu” trong Thư viện.",
    href: "/thu-vien?loc=da-luu",
    hrefLabel: "Xem bài đã lưu",
  },
  {
    id: "ai-doc-duoc",
    keywords: ["ai doc duoc", "co ai xem", "rieng tu", "bao mat", "thay co co doc"],
    answer:
      "Nhật ký cảm xúc của bạn là riêng tư — thầy cô không đọc được nội dung bạn viết. " +
      "Chỉ có một ngoại lệ: nếu bạn nhắn điều gì khiến hệ thống lo cho sự an toàn của bạn, " +
      "thầy cô phụ trách sẽ được báo để hỏi thăm.",
    href: "/gioi-thieu",
    hrefLabel: "Đọc về dữ liệu của bạn",
  },
  {
    id: "xoa-du-lieu",
    keywords: ["xoa tai khoan", "xoa du lieu", "xoa het", "khong dung nua"],
    answer:
      "Bạn xoá được toàn bộ dữ liệu của mình trong trang Hồ sơ, mục “Xoá toàn bộ dữ liệu”. " +
      "Thao tác này không hoàn tác được.",
    href: "/ho-so",
    hrefLabel: "Mở Hồ sơ",
  },
  {
    id: "doi-thong-tin",
    keywords: ["doi thong tin", "sua ho so", "doi ten", "doi truong", "doi lop"],
    answer:
      "Thông tin bạn điền lúc tạo tài khoản hiện ở trang Hồ sơ. Hiện chưa sửa được trực tiếp — " +
      "bạn nhắn thầy cô phụ trách để đổi giúp.",
    href: "/ho-so",
    hrefLabel: "Mở Hồ sơ",
  },
  {
    id: "quen-mat-khau",
    keywords: ["quen mat khau", "doi mat khau", "khong dang nhap duoc", "mat khau"],
    answer:
      "Ở trang đăng nhập có dòng “Quên mật khẩu?”. Bấm vào đó rồi nhập email, hệ thống sẽ gửi " +
      "cho bạn một đường dẫn để đặt lại.",
    href: "/quen-mat-khau",
    hrefLabel: "Đặt lại mật khẩu",
  },
  {
    id: "xac-thuc-email",
    keywords: ["xac thuc email", "chua nhan duoc mail", "khong luu duoc", "can xac thuc"],
    answer:
      "Bạn cần xác thực email trước khi lưu được nhật ký hay kết quả. Kiểm tra hộp thư (cả mục " +
      "spam) để tìm mail xác thực; trang Xác thực email có nút gửi lại.",
    href: "/xac-thuc-email",
    hrefLabel: "Mở trang xác thực",
  },
  {
    id: "tinh-nang-ai",
    keywords: ["tinh nang ai", "bat ai", "phan chieu ai", "ai la gi"],
    answer:
      "Tính năng AI là tuỳ chọn và mặc định TẮT. Bạn bật hoặc tắt nó bất cứ lúc nào trong trang " +
      "Hồ sơ, mục “Tính năng AI”. Tắt đi thì các phản chiếu AI đã lưu cũng bị xoá vĩnh viễn.",
    href: "/ho-so",
    hrefLabel: "Mở Hồ sơ",
  },
  {
    id: "music-confession",
    keywords: ["music hub", "nghe nhac", "confession", "tam su", "chia se an danh"],
    answer:
      "Music Hub và Confession đang được xây, chưa dùng được. Khi xong, hai mục đó sẽ hiện " +
      "trong menu mà không còn nhãn “Sắp ra mắt”.",
  },
];

/**
 * Câu trả lời khi không khớp mục nào.
 *
 * Guideline §6.2: "Nếu câu hỏi ngoài phạm vi, nói rõ chatbot hỗ trợ cách dùng
 * ExamCalm và gợi ý tính năng phù hợp; KHÔNG BỊA chức năng." Câu này cũng cố ý
 * KHÔNG giả vờ hiểu rồi đưa một câu chung chung nghe như đã trả lời.
 */
export const FALLBACK_ANSWER =
  "Mình chỉ giúp được về cách dùng ExamCalm thôi — chỗ nào bấm vào đâu, dữ liệu của bạn ra " +
  "sao, tài khoản và cài đặt. Bạn thử hỏi lại ngắn hơn, ví dụ “Nhật ký ở đâu?” hoặc “Làm sao " +
  "xem lại kết quả?”. Còn nếu bạn đang muốn nói chuyện về cảm xúc của mình, hãy ghi vào Nhật " +
  "ký hoặc nói với một người lớn bạn tin tưởng.";

export type FaqMatch = { answer: string; href?: string; hrefLabel?: string; matchedId: string | null };

/**
 * Khớp câu hỏi với FAQ.
 *
 * Chọn mục có từ khoá khớp DÀI NHẤT, không phải mục đầu tiên khớp: "bài tập
 * cbt" phải thắng "bài tập", nếu không thì thứ tự khai báo trong mảng lại
 * quyết định câu trả lời — một loại phụ thuộc ngầm rất dễ vỡ khi thêm mục mới.
 */
export function matchFaq(question: string): FaqMatch {
  const q = normalizeQuestion(question);
  if (q === "") return { answer: FALLBACK_ANSWER, matchedId: null };

  let best: { entry: FaqEntry; length: number } | null = null;
  for (const entry of FAQ) {
    for (const kw of entry.keywords) {
      if (q.includes(kw) && (best === null || kw.length > best.length)) {
        best = { entry, length: kw.length };
      }
    }
  }

  if (best === null) return { answer: FALLBACK_ANSWER, matchedId: null };
  return {
    answer: best.entry.answer,
    href: best.entry.href,
    hrefLabel: best.entry.hrefLabel,
    matchedId: best.entry.id,
  };
}

// Bộ phát hiện khủng hoảng theo từ khoá — thuần TypeScript, không import firebase-admin,
// không đọc Firestore, không state mức module. Đây là Lớp 1 trong hai lớp phát hiện độc lập
// (§3.1 design spec): nhanh, miễn phí, tất định, chạy TRƯỚC khi gọi model. Bắt được ở đây thì
// KHÔNG gọi model nữa — trả thẳng phản hồi khủng hoảng, không có lý do gửi câu nói của học
// sinh ra một bên thứ ba.
//
// CẢNH BÁO: danh sách từ khoá dưới đây là bản nháp đầu tiên do một mô hình ngôn ngữ soạn ra,
// KHÔNG PHẢI một công cụ sàng lọc đã được kiểm chứng lâm sàng. Một chuyên gia tâm lý học đường
// PHẢI rà soát danh sách này trước khi tính năng này được đưa ra cho học sinh dùng thật — đây
// là một mục chặn (blocking) trong checklist go-live, không phải việc nên làm. Đừng đọc danh
// sách này rồi mặc định nó đã đủ thẩm quyền chỉ vì nó nằm trong code.
//
// Chiều sai lầm được chọn có chủ đích, giống hệt safetyFilter.ts (§3.2 design spec): THÀ BÁO
// NHẦM CÒN HƠN BỎ SÓT. Báo nhầm là thầy cô hỏi thăm một em đang ổn — hơi ngượng. Bỏ sót là một
// đứa trẻ gặp nguy mà không ai biết. Vì vậy danh sách này CỐ Ý bao phủ rộng hơn mức tối thiểu,
// và khi một cụm mơ hồ giữa hai mức, nó được xếp vào mức NẶNG hơn ("urgent") thay vì mức nhẹ
// ("concern"). Đừng "dọn gọn" danh sách này để giảm báo nhầm — điều đó mở lại đúng lỗ hổng nó
// tồn tại để bịt.

/**
 * Cụm biểu đạt Ý ĐỊNH hoặc KẾ HOẠCH tự hại — mức "urgent", thầy cô cần can thiệp NGAY.
 * Bao gồm cả các phương thức tự hại cụ thể (rạch tay, treo cổ, nhảy lầu...) vì nêu tên
 * một phương thức là dấu hiệu ý định đã cụ thể hoá, không còn là tuyệt vọng chung chung nữa.
 */
export const URGENT_KEYWORDS: readonly string[] = [
  "tự tử",
  "tự sát",
  "tự vẫn",
  "kết liễu cuộc đời",
  "kết liễu đời mình",
  "kết thúc cuộc đời",
  "kết thúc cuộc sống",
  "muốn chết",
  "không muốn sống nữa",
  "không muốn sống",
  "không còn muốn sống",
  "chết đi cho rồi",
  "chết cho xong",
  "tự làm hại bản thân",
  "tự hại bản thân",
  "tự hại",
  "rạch tay",
  "cắt tay",
  "cắt cổ tay",
  "treo cổ",
  "nhảy lầu",
  "nhảy cầu",
  "uống thuốc tự tử",
  "uống thuốc quá liều",
  "kế hoạch tự tử",
  "cách tự tử",
  "cách để chết",
  // Học sinh có thể code-switch sang tiếng Anh khi diễn đạt điều khó nói.
  "suicide",
  "kill myself",
  "end my life",
  "self harm",
  "self-harm",
];

/**
 * Cụm biểu đạt TUYỆT VỌNG, VÔ GIÁ TRỊ, hoặc MUỐN BIẾN MẤT — mức "concern", chưa có ý định
 * hay kế hoạch cụ thể, nhưng thầy cô nên hỏi thăm (không cần đi ngay). CỐ Ý không đưa các từ
 * đơn lẻ như "mệt mỏi" hay "buồn" vào đây — chúng xuất hiện thường xuyên trong than thở áp
 * lực thi bình thường và sẽ khiến bộ lọc báo nhầm liên tục; chỉ những cụm gắn rõ với vô
 * vọng/vô giá trị/muốn biến mất mới đủ đặc hiệu để đưa vào danh sách này.
 */
export const CONCERN_KEYWORDS: readonly string[] = [
  "vô dụng",
  "vô giá trị",
  "không ai cần",
  "không ai yêu",
  "không ai quan tâm",
  "là gánh nặng",
  "gánh nặng cho mọi người",
  "gánh nặng cho gia đình",
  "muốn biến mất",
  "muốn biến mất khỏi thế giới",
  "ước gì mình chưa từng tồn tại",
  "ước gì con chưa từng sinh ra",
  "chán sống",
  "sống không có ý nghĩa",
  "cuộc sống vô nghĩa",
  "không còn hy vọng",
  "tuyệt vọng",
  "mệt mỏi với cuộc sống",
  "muốn ngủ mãi mãi",
  "không còn lý do để sống",
];

/** Escape các ký tự đặc biệt của regex trong một đoạn văn bản thuần. */
function escapeRegExp(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Dựng regex khớp một từ khoá, cho phép khoảng trắng bất kỳ (một hoặc nhiều — dấu cách,
 * xuống dòng, non-breaking space...) giữa các từ trong cụm, để một học sinh chèn xuống dòng
 * hay double space giữa hai từ không lách được qua so khớp chuỗi con đơn giản.
 */
function buildKeywordPattern(normalizedKeyword: string): RegExp {
  const parts = normalizedKeyword.split(/\s+/).map(escapeRegExp);
  return new RegExp(parts.join("\\s+"));
}

/** Tìm từ khoá đầu tiên trong `keywords` xuất hiện trong `normalizedText`; null nếu không có. */
function findFirstMatch(
  normalizedText: string,
  keywords: readonly string[],
): string | null {
  for (const keyword of keywords) {
    const normalizedKeyword = keyword.normalize("NFC").toLowerCase();
    const pattern = buildKeywordPattern(normalizedKeyword);
    if (pattern.test(normalizedText)) {
      return keyword;
    }
  }
  return null;
}

export type CrisisDetectionResult = {
  detected: boolean;
  severity: "urgent" | "concern" | null;
  /** Cụm từ khoá (nguyên văn trong URGENT_KEYWORDS/CONCERN_KEYWORDS) đã kích hoạt — dùng để
   *  admin hiệu chỉnh danh sách. KHÔNG được ghi trường này (hay bất kỳ trích đoạn nào từ lời
   *  học sinh) vào crisisAlerts — xem §3.4 design spec: cảnh báo không chứa nội dung gốc. */
  matched: string | null;
};

/**
 * Quét văn bản tìm dấu hiệu khủng hoảng theo từ khoá. Chạy TRƯỚC khi gọi model (Lớp 1, §3.1):
 * nếu `detected: true`, caller phải trả thẳng phản hồi khủng hoảng và KHÔNG gửi văn bản này
 * tới AI provider.
 *
 * Kiểm tra URGENT_KEYWORDS trước CONCERN_KEYWORDS: nếu một câu khớp cả hai mức, kết quả trả
 * về là "urgent" — đúng chiều sai lầm đã chọn (thà báo mức nặng nhầm còn hơn báo nhẹ khi thật
 * ra đang cấp bách).
 */
export function detectCrisisKeywords(text: string): CrisisDetectionResult {
  if (text.length === 0) {
    return { detected: false, severity: null, matched: null };
  }

  // Chuẩn hoá NFC + lowercase trước khi so khớp: tiếng Việt có thể tới dưới dạng NFC hoặc
  // NFD (dấu tổ hợp tách rời), cùng một chữ nhưng khác byte — so khớp phải bất biến với cả
  // hai dạng và không phân biệt hoa thường.
  const normalized = text.normalize("NFC").toLowerCase();

  const urgentMatch = findFirstMatch(normalized, URGENT_KEYWORDS);
  if (urgentMatch !== null) {
    return { detected: true, severity: "urgent", matched: urgentMatch };
  }

  const concernMatch = findFirstMatch(normalized, CONCERN_KEYWORDS);
  if (concernMatch !== null) {
    return { detected: true, severity: "concern", matched: concernMatch };
  }

  return { detected: false, severity: null, matched: null };
}

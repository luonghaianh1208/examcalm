/**
 * Bắt dấu hiệu TIÊM PROMPT trong bài Confession, bằng luật tất định.
 *
 * VÌ SAO CẦN LỚP NÀY
 *
 * Đo thực tế trên Stali với ba kiểu tiêm, chạy 9 lượt mỗi model: mọi model đều
 * có lúc bị lừa trả về AN_TOAN cho bài lẽ ra phải giữ lại — tỷ lệ khoảng 1/9.
 * Thêm câu nhắc lại sau khối dữ liệu KHÔNG làm con số đó tốt lên một cách đo
 * được. Nói cách khác: không có model nào đủ tin cậy để một mình gác cổng đăng
 * công khai.
 *
 * Hàm này không hỏi model nên không thể bị lừa. Nó chạy TRƯỚC, và bài nào dính
 * thì đi thẳng vào hàng chờ người đọc, model không bao giờ được hỏi.
 *
 * ĐÂY LÀ TẤM LƯỚI, KHÔNG PHẢI BẢO ĐẢM. Kẻ tấn công đủ kiên nhẫn vẫn có thể
 * viết một câu tiêm không khớp mẫu nào ở đây. Vì vậy nó là lớp thứ nhất trong
 * ba lớp: lọc tất định → model → và người duyệt vẫn gỡ được bài đã đăng.
 *
 * NGUYÊN TẮC CHỌN MẪU: ưu tiên gần như không báo nhầm.
 * Học sinh viết "mình bỏ qua chuyện đó rồi" là câu hoàn toàn bình thường, nên
 * không bắt riêng cụm "bỏ qua". Chỉ bắt những thứ mà một học sinh kể chuyện
 * thật gần như không bao giờ viết ra.
 */

export type InjectionCheck = { suspicious: boolean; reason: string };

/** Bỏ dấu để "bo qua moi chi dan" cũng khớp như "bỏ qua mọi chỉ dẫn". */
function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

const PATTERNS: Array<{ re: RegExp; reason: string }> = [
  /*
   * 1. Chính hai từ phán quyết của bộ lọc.
   *
   * Không học sinh nào kể chuyện của mình bằng chuỗi AN_TOAN viết hoa có gạch
   * dưới. Xuất hiện nó nghĩa là người viết biết về bộ lọc và đang nhắm vào nó.
   */
  { re: /\bAN_TOAN\b|\bGIU_LAI\b/, reason: "chứa từ phán quyết của bộ lọc" },

  /*
   * 2. Dấu mốc bao quanh dữ liệu.
   *
   * Đây là kiểu tấn công "thoát khỏi khối": chèn dấu đóng giả để phần sau bị
   * đọc như chỉ dẫn thay vì dữ liệu.
   */
  { re: /===\s*bai\s*viet\s*===/i, reason: "chứa dấu mốc dữ liệu của hệ thống" },

  /*
   * 3. Nhãn vai trò ở đầu dòng — cách giả làm thông điệp hệ thống.
   */
  { re: /(^|\n)\s*(system|assistant|user|developer)\s*:/i, reason: "giả làm thông điệp hệ thống" },

  /*
   * 4. Cụm GHÉP, không phải từ đơn.
   *
   * "bỏ qua" một mình là tiếng Việt thường ngày. "bỏ qua ... chỉ dẫn/luật/quy
   * tắc/hướng dẫn" thì không còn là chuyện thường ngày nữa. Giới hạn 40 ký tự
   * ở giữa để tránh bắt nhầm hai ý rời nhau trong một bài dài.
   */
  {
    re: /\b(bo qua|phot lo|khong can theo)\b.{0,40}\b(chi dan|luat|quy tac|huong dan|he thong|phia tren|ben tren)\b/,
    reason: "yêu cầu bỏ qua chỉ dẫn hệ thống",
  },
  {
    // `s?` cho dạng số nhiều: "ignore all previous instructions" là cách viết
    // phổ biến nhất của kiểu tấn công này, mà \binstruction\b lại không khớp nó.
    re: /\bignore\b.{0,40}\b(instructions?|rules?|above|prompts?|system)\b/,
    reason: "yêu cầu bỏ qua chỉ dẫn hệ thống (tiếng Anh)",
  },

  /*
   * 5. Ép câu trả lời.
   */
  {
    re: /\b(chi tra loi|luon tra loi|hay tra loi|tra loi dung)\b.{0,30}\b(an_toan|la an toan)\b/,
    reason: "ép bộ lọc trả về kết quả cho qua",
  },

  /*
   * 6. Tuyên bố bộ lọc đã tắt.
   */
  {
    re: /\b(bo loc|kiem duyet|he thong)\b.{0,20}\b(da tat|tat roi|khong hoat dong|bi vo hieu)\b/,
    reason: "tuyên bố bộ lọc đã tắt",
  },
];

export function detectPromptInjection(text: string): InjectionCheck {
  // Mẫu 1 xét trên bản GỐC vì nó phụ thuộc chữ hoa; các mẫu còn lại xét trên
  // bản đã bỏ dấu.
  const goc = text;
  const chuan = normalize(text);

  for (const { re, reason } of PATTERNS) {
    const target = re.source.includes("AN_TOAN") ? goc : chuan;
    if (re.test(target)) return { suspicious: true, reason };
  }
  return { suspicious: false, reason: "" };
}

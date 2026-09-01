/**
 * Ước lượng thời gian làm một bài test, tính từ số câu.
 *
 * Phản hồi 1.1 của học sinh: "mất khoảng bao nhiêu phút". Cố ý TÍNH ra thay vì
 * bắt thầy cô nhập thêm một trường nữa — một trường nhập tay sẽ nhanh chóng
 * lệch khỏi số câu thật mỗi lần ai đó thêm hoặc bớt câu hỏi.
 *
 * 20 giây mỗi câu là mức thang tự đánh giá kiểu Likert ngắn (GAD-7, PHQ-9)
 * thường mất: đọc câu, chọn một trong bốn mức. Luôn hiển thị kèm chữ "khoảng"
 * vì đây là ước lượng, không phải cam kết.
 */
const SECONDS_PER_QUESTION = 20;

export function estimateMinutes(questionCount: number): number {
  if (questionCount <= 0) return 0;
  // Tối thiểu 1 phút: hiện "khoảng 0 phút" cho bài 2 câu thì vô nghĩa.
  return Math.max(1, Math.round((questionCount * SECONDS_PER_QUESTION) / 60));
}

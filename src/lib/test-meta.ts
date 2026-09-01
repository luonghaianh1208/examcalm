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

/**
 * Ước lượng thời gian một bài tập CBT, tính từ số bước.
 *
 * KHÔNG dùng chung hàm với bài kiểm tra: một câu trắc nghiệm là đọc rồi chọn
 * một trong bốn mức (20 giây), còn một bước CBT là đọc gợi ý rồi VIẾT câu trả
 * lời của mình. Dùng chung sẽ ra "4 bước · 1 phút" trong khi thực tế gần 5
 * phút — nói sai với học sinh về thứ họ sắp bỏ thời gian ra làm.
 *
 * 75 giây mỗi bước cho ra đúng mốc quen thuộc: 4 bước ≈ 5 phút.
 */
const SECONDS_PER_CBT_STEP = 75;

export function estimateCbtMinutes(stepCount: number): number {
  if (stepCount <= 0) return 0;
  return Math.max(1, Math.round((stepCount * SECONDS_PER_CBT_STEP) / 60));
}

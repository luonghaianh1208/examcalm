import type { MoodIcon } from "@/lib/types/mood";

/**
 * Nhãn và chấm màu cho từng mức cảm xúc — dùng chung cho form ghi nhật ký và
 * cho Dashboard, để hai nơi không bao giờ gọi cùng một mức bằng hai tên khác
 * nhau.
 *
 * "Hơi xuống" đã đổi thành "Hơi mệt": học sinh phản ánh từ cũ khó hiểu. Từ mới
 * đi song song với "Rất mệt" nên đọc một lượt là hiểu cả thang.
 *
 * CỐ Ý không đổi sang từ vựng lo âu (căng/lo) dù Brand Guideline trang 14 dùng
 * bộ chữ đó: giá trị lưu trong Firestore là moodIcon theo trục dễ chịu ↔ mệt.
 * Đổi nhãn sang trục lo âu sẽ khiến dữ liệu cũ và dữ liệu mới mang hai nghĩa
 * khác nhau dưới cùng một tên field — hỏng cả biểu đồ xu hướng lẫn nghiên cứu.
 *
 * Chấm màu thay cho icon: guideline trang 21 vẽ đúng như vậy, và trang 10 cấm
 * trộn nhiều bộ icon.
 */
export const MOOD_LABELS: Record<MoodIcon, { label: string; dot: string }> = {
  very_low: { label: "Rất mệt", dot: "bg-[var(--ec-peach-500)]" },
  low: { label: "Hơi mệt", dot: "bg-[var(--ec-sun-500)]" },
  neutral: { label: "Bình thường", dot: "bg-[var(--ec-border-strong)]" },
  calm: { label: "Dễ chịu", dot: "bg-[var(--ec-aqua-500)]" },
  happy: { label: "Vui", dot: "bg-[var(--ec-sage-500)]" },
};

import type { MoodRecord } from "@/lib/firestore/moods";

/** Các khoảng thời gian Dashboard cho phép xem — PRD §7.2.9. */
export const TREND_RANGES = [7, 30, 90] as const;
export type TrendRange = (typeof TREND_RANGES)[number];

export type TrendPoint = { date: Date; score: number };

/**
 * Thang điểm cảm xúc là 1-10, CỐ ĐỊNH.
 *
 * Trục y không bao giờ tự co giãn theo dữ liệu. Nếu để nó tự co, một thay đổi
 * từ 6 lên 7 sẽ vẽ thành một cú vọt gần hết chiều cao khung — với ứng dụng về
 * lo âu thì đó là làm học sinh hoảng vì một biến động bình thường. Brand
 * Guideline mục 5 (Dashboard) và trang 16 đều cấm mọi thứ gây cảm giác chẩn
 * đoán hay báo động.
 */
export const SCORE_MIN = 1;
export const SCORE_MAX = 10;

/**
 * Lấy các lần ghi nhận trong `days` ngày gần nhất, sắp theo thời gian tăng dần.
 *
 * `now` truyền vào được để test không phụ thuộc đồng hồ máy.
 *
 * Bản ghi có `createdAt = null` bị loại: đó là document vừa ghi mà
 * serverTimestamp chưa kịp trả về: không biết nó thuộc ngày nào thì không thể
 * đặt lên trục thời gian.
 */
export function pointsInRange(
  logs: MoodRecord[],
  days: TrendRange,
  now: Date = new Date(),
): TrendPoint[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return logs
    .filter((l): l is MoodRecord & { createdAt: Date } => l.createdAt !== null)
    .filter((l) => l.createdAt.getTime() >= cutoff)
    .map((l) => ({ date: l.createdAt, score: l.moodScore }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Mô tả xu hướng bằng NGÔN NGỮ TƯƠNG QUAN, không khẳng định nhân quả.
 *
 * Guideline mục 5: "AI insight dùng ngôn ngữ tương quan: 'có vẻ', 'trong những
 * lần bạn ghi nhận'". Hàm này không nói vì sao điểm đổi, chỉ nói nó đã đổi thế
 * nào — và chỉ nói khi có đủ dữ liệu để câu đó có nghĩa.
 */
export function describeTrend(points: TrendPoint[]): string | null {
  // Dưới 3 điểm thì mọi nhận định về "xu hướng" đều là đọc vị nhiễu.
  if (points.length < 3) return null;

  const half = Math.floor(points.length / 2);
  const dau = points.slice(0, half);
  const cuoi = points.slice(points.length - half);
  const tb = (xs: TrendPoint[]) => xs.reduce((s, p) => s + p.score, 0) / xs.length;
  const chenh = tb(cuoi) - tb(dau);

  // Ngưỡng 0.5 điểm: dưới mức đó là dao động thường ngày, gọi tên nó ra chỉ
  // làm học sinh diễn giải quá mức một con số vốn do chính mình ước lượng.
  if (Math.abs(chenh) < 0.5) {
    return "Trong những lần bạn ghi nhận, điểm khá ổn định.";
  }
  return chenh > 0
    ? "Trong những lần bạn ghi nhận gần đây, điểm có vẻ nhích lên."
    : "Trong những lần bạn ghi nhận gần đây, điểm có vẻ thấp hơn trước.";
}

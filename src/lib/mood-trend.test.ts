import { describe, expect, it } from "vitest";
import { describeTrend, pointsInRange, type TrendPoint } from "./mood-trend";
import type { MoodRecord } from "@/lib/firestore/moods";

const NOW = new Date("2026-09-01T12:00:00Z");

function log(daysAgo: number, score: number, id = String(daysAgo)): MoodRecord {
  return {
    id,
    moodScore: score,
    moodIcon: "neutral",
    note: "",
    tags: [],
    context: "standalone",
    linkedActivityRef: null,
    createdAt: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000),
  };
}

describe("pointsInRange", () => {
  it("chỉ lấy bản ghi trong khoảng đã chọn", () => {
    const logs = [log(1, 5), log(10, 6), log(40, 7)];
    expect(pointsInRange(logs, 7, NOW)).toHaveLength(1);
    expect(pointsInRange(logs, 30, NOW)).toHaveLength(2);
    expect(pointsInRange(logs, 90, NOW)).toHaveLength(3);
  });

  it("sắp xếp theo thời gian tăng dần", () => {
    const points = pointsInRange([log(1, 5), log(5, 6), log(3, 7)], 30, NOW);
    expect(points.map((p) => p.score)).toEqual([6, 7, 5]);
  });

  // createdAt = null là document vừa ghi mà serverTimestamp chưa trả về. Không
  // biết nó thuộc ngày nào thì không đặt lên trục thời gian được.
  it("bỏ qua bản ghi chưa có thời gian", () => {
    const chuaCo: MoodRecord = { ...log(1, 5), createdAt: null };
    expect(pointsInRange([chuaCo, log(2, 6)], 30, NOW)).toHaveLength(1);
  });

  it("không có bản ghi nào thì trả về mảng rỗng", () => {
    expect(pointsInRange([], 7, NOW)).toEqual([]);
  });
});

describe("describeTrend", () => {
  const p = (scores: number[]): TrendPoint[] =>
    scores.map((score, i) => ({ date: new Date(NOW.getTime() + i * 1000), score }));

  // Dưới 3 điểm thì mọi nhận định về xu hướng đều là đọc vị nhiễu.
  it("không nói gì khi chưa đủ 3 lần ghi", () => {
    expect(describeTrend(p([5]))).toBeNull();
    expect(describeTrend(p([5, 7]))).toBeNull();
  });

  it("nói ổn định khi chênh lệch dưới ngưỡng", () => {
    expect(describeTrend(p([5, 5, 5, 5]))).toMatch(/ổn định/);
  });

  it("dùng ngôn ngữ tương quan chứ không khẳng định nhân quả", () => {
    const tang = describeTrend(p([3, 3, 8, 8]));
    expect(tang).toMatch(/có vẻ/);
    // Không được xuất hiện từ ngữ quy kết nguyên nhân.
    expect(tang).not.toMatch(/vì|do|nhờ|khiến/);
  });

  it("nhận ra chiều đi lên và đi xuống", () => {
    expect(describeTrend(p([3, 3, 8, 8]))).toMatch(/nhích lên/);
    expect(describeTrend(p([8, 8, 3, 3]))).toMatch(/thấp hơn/);
  });
});

import { describe, it, expect } from "vitest";
import { summarizeMood, pairBeforeAfter } from "./progress";
import type { MoodRecord } from "@/lib/firestore/moods";

function log(over: Partial<MoodRecord>): MoodRecord {
  return {
    id: "m", moodScore: 5, moodIcon: "neutral", note: "", tags: [],
    context: "standalone", linkedActivityRef: null,
    createdAt: new Date("2026-08-20T10:00:00Z"), ...over,
  };
}

describe("summarizeMood", () => {
  it("trả về null cho danh sách rỗng", () => {
    expect(summarizeMood([])).toBeNull();
  });

  it("tính đúng trung bình và số lượng", () => {
    const s = summarizeMood([log({ moodScore: 4 }), log({ moodScore: 8 })]);
    expect(s).toEqual({ count: 2, average: 6, latest: 4, lowest: 4, highest: 8 });
  });

  it("làm tròn trung bình tới 1 chữ số thập phân", () => {
    const s = summarizeMood([log({ moodScore: 4 }), log({ moodScore: 5 }), log({ moodScore: 5 })]);
    expect(s?.average).toBe(4.7);
  });
});

describe("pairBeforeAfter", () => {
  it("ghép cặp before/after theo linkedActivityRef", () => {
    const pairs = pairBeforeAfter([
      log({ id: "a", context: "before", moodScore: 3, linkedActivityRef: "testAttempts/x" }),
      log({ id: "b", context: "after", moodScore: 6, linkedActivityRef: "testAttempts/x" }),
    ]);
    expect(pairs).toEqual([{ activityRef: "testAttempts/x", before: 3, after: 6, delta: 3 }]);
  });

  it("bỏ qua ghi chép lẻ không có cặp", () => {
    expect(pairBeforeAfter([
      log({ context: "before", linkedActivityRef: "testAttempts/x" }),
    ])).toEqual([]);
  });

  it("bỏ qua ghi chép standalone", () => {
    expect(pairBeforeAfter([log({ context: "standalone" })])).toEqual([]);
  });
});

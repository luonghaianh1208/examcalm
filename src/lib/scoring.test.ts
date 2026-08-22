import { describe, it, expect } from "vitest";
import {
  calculateScore, resolveLevel, isComplete,
  IncompleteAnswersError, InvalidAnswerError,
} from "./scoring";
import type { Question, Threshold } from "@/lib/types/test";

const QUESTIONS: Question[] = [
  { id: "q1", text: "Bạn có khó ngủ trước kỳ thi?", options: [
    { label: "Không bao giờ", score: 0 }, { label: "Thỉnh thoảng", score: 1 }, { label: "Thường xuyên", score: 2 },
  ]},
  { id: "q2", text: "Bạn có hay lo lắng quá mức?", options: [
    { label: "Không bao giờ", score: 0 }, { label: "Thỉnh thoảng", score: 1 }, { label: "Thường xuyên", score: 2 },
  ]},
];

const THRESHOLDS: Threshold[] = [
  { min: 0, max: 1, level: "thap", interpretation: "Mức lo âu thấp." },
  { min: 2, max: 3, level: "trung-binh", interpretation: "Mức lo âu trung bình." },
  { min: 4, max: 4, level: "cao", interpretation: "Mức lo âu cao." },
];

describe("calculateScore", () => {
  it("cộng đúng điểm của các option đã chọn", () => {
    expect(calculateScore(QUESTIONS, { q1: 2, q2: 1 })).toBe(3);
  });

  it("trả về 0 khi chọn toàn option điểm 0", () => {
    expect(calculateScore(QUESTIONS, { q1: 0, q2: 0 })).toBe(0);
  });

  it("ném IncompleteAnswersError khi thiếu câu trả lời", () => {
    expect(() => calculateScore(QUESTIONS, { q1: 1 })).toThrow(IncompleteAnswersError);
  });

  it("ném InvalidAnswerError khi chỉ số option vượt phạm vi", () => {
    expect(() => calculateScore(QUESTIONS, { q1: 5, q2: 0 })).toThrow(InvalidAnswerError);
  });

  it("ném InvalidAnswerError khi chỉ số option âm", () => {
    expect(() => calculateScore(QUESTIONS, { q1: -1, q2: 0 })).toThrow(InvalidAnswerError);
  });

  it("bỏ qua câu trả lời thừa không khớp câu hỏi nào", () => {
    expect(calculateScore(QUESTIONS, { q1: 1, q2: 1, qX: 9 })).toBe(2);
  });

  it("trả về 0 cho bộ câu hỏi rỗng", () => {
    expect(calculateScore([], {})).toBe(0);
  });
});

describe("resolveLevel", () => {
  it("khớp đúng ngưỡng ở giữa", () => {
    expect(resolveLevel(3, THRESHOLDS)?.level).toBe("trung-binh");
  });

  it("khớp đúng ở biên min", () => {
    expect(resolveLevel(2, THRESHOLDS)?.level).toBe("trung-binh");
  });

  it("khớp đúng ở biên max", () => {
    expect(resolveLevel(1, THRESHOLDS)?.level).toBe("thap");
  });

  it("khớp ngưỡng có min bằng max", () => {
    expect(resolveLevel(4, THRESHOLDS)?.level).toBe("cao");
  });

  it("trả về null khi điểm không rơi vào ngưỡng nào", () => {
    expect(resolveLevel(99, THRESHOLDS)).toBeNull();
  });

  it("trả về null khi danh sách ngưỡng rỗng", () => {
    expect(resolveLevel(0, [])).toBeNull();
  });

  it("lấy ngưỡng đầu tiên khớp khi các ngưỡng chồng lấn", () => {
    const overlapping: Threshold[] = [
      { min: 0, max: 5, level: "a", interpretation: "A" },
      { min: 3, max: 8, level: "b", interpretation: "B" },
    ];
    expect(resolveLevel(4, overlapping)?.level).toBe("a");
  });
});

describe("isComplete", () => {
  it("true khi mọi câu hỏi đều có câu trả lời", () => {
    expect(isComplete(QUESTIONS, { q1: 0, q2: 0 })).toBe(true);
  });

  it("false khi còn câu chưa trả lời", () => {
    expect(isComplete(QUESTIONS, { q1: 0 })).toBe(false);
  });
});

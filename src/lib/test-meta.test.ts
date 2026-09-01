import { describe, expect, it } from "vitest";
import { estimateMinutes } from "./test-meta";

describe("estimateMinutes", () => {
  it("GAD-7 (7 câu) ra khoảng 2 phút", () => {
    expect(estimateMinutes(7)).toBe(2);
  });

  it("PHQ-9 (9 câu) ra khoảng 3 phút", () => {
    expect(estimateMinutes(9)).toBe(3);
  });

  // Bài rất ngắn vẫn phải ra một con số có nghĩa — "khoảng 0 phút" thì thà
  // đừng hiện còn hơn.
  it("bài ngắn vẫn tối thiểu 1 phút", () => {
    expect(estimateMinutes(1)).toBe(1);
    expect(estimateMinutes(2)).toBe(1);
  });

  it("bài rỗng trả về 0 để chỗ gọi tự quyết định ẩn đi", () => {
    expect(estimateMinutes(0)).toBe(0);
  });
});

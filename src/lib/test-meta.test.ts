import { describe, expect, it } from "vitest";
import { estimateCbtMinutes, estimateMinutes } from "./test-meta";

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

describe("estimateCbtMinutes", () => {
  // Mốc trong chính phản hồi của chủ sản phẩm: "5 phút · 4 bước".
  it("4 bước ra 5 phút", () => {
    expect(estimateCbtMinutes(4)).toBe(5);
  });

  // Rào chắn chống việc gộp hai hàm lại làm một: một bước CBT là đọc rồi VIẾT,
  // tốn hơn hẳn một câu trắc nghiệm.
  it("một bước CBT lâu hơn một câu trắc nghiệm", () => {
    expect(estimateCbtMinutes(4)).toBeGreaterThan(estimateMinutes(4));
  });

  it("bài ngắn vẫn tối thiểu 1 phút, bài rỗng trả 0", () => {
    expect(estimateCbtMinutes(1)).toBe(1);
    expect(estimateCbtMinutes(0)).toBe(0);
  });
});

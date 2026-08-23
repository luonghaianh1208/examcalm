import { describe, it, expect } from "vitest";
import { toSlug } from "./slug";

describe("toSlug", () => {
  it("bỏ dấu tiếng Việt", () => {
    expect(toSlug("Kỹ thuật thở 4-7-8")).toBe("ky-thuat-tho-4-7-8");
  });

  it("xử lý chữ đ và Đ", () => {
    expect(toSlug("Đi ngủ đúng giờ")).toBe("di-ngu-dung-gio");
  });

  it("chuyển về chữ thường", () => {
    expect(toSlug("THƯ GIÃN")).toBe("thu-gian");
  });

  it("gộp khoảng trắng và ký tự đặc biệt thành một dấu gạch", () => {
    expect(toSlug("Học  tập &  nghỉ ngơi!")).toBe("hoc-tap-nghi-ngoi");
  });

  it("bỏ dấu gạch thừa ở đầu và cuối", () => {
    expect(toSlug("  --Thiền--  ")).toBe("thien");
  });

  it("trả về chuỗi rỗng khi không còn ký tự hợp lệ", () => {
    expect(toSlug("!!!")).toBe("");
  });
});

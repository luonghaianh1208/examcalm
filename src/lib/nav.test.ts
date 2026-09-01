import { describe, expect, it } from "vitest";
import { ADMIN_NAV, STUDENT_NAV, isActive, visibleNav, type NavItem } from "./nav";

const item = (href: string, exact?: boolean): Pick<NavItem, "href" | "exact"> => ({ href, exact });

describe("isActive", () => {
  it("khớp chính xác đường dẫn của chính nó", () => {
    expect(isActive("/thu-vien", item("/thu-vien"))).toBe(true);
  });

  it("khớp cả trang con", () => {
    expect(isActive("/thu-vien/ky-thuat-tho", item("/thu-vien"))).toBe(true);
  });

  it("không khớp đường dẫn khác", () => {
    expect(isActive("/test", item("/thu-vien"))).toBe(false);
  });

  // Đây là lớp lỗi mà cờ `exact` sinh ra để chặn: nếu không có nó, một mục là
  // tổ tiên của mục khác sẽ sáng trên MỌI trang con.
  it("mục exact KHÔNG sáng trên trang con", () => {
    expect(isActive("/admin/canh-bao", item("/admin", true))).toBe(false);
    expect(isActive("/admin", item("/admin", true))).toBe(true);
  });

  it('"/" không sáng trên mọi route khác', () => {
    expect(isActive("/thu-vien", item("/", true))).toBe(false);
    expect(isActive("/", item("/", true))).toBe(true);
  });

  // Chặn lỗi khớp theo tiền tố chuỗi thuần: "/test" không được sáng khi đang
  // ở "/testimonial" — dấu / phân cách là bắt buộc.
  it("không khớp khi chỉ trùng tiền tố chuỗi", () => {
    expect(isActive("/testimonial", item("/test"))).toBe(false);
  });
});

describe("visibleNav", () => {
  it("ẩn mục authOnly với khách chưa đăng nhập", () => {
    const items = visibleNav(STUDENT_NAV, false);
    expect(items.some((i) => i.href === "/nhat-ky")).toBe(false);
    expect(items.some((i) => i.href === "/thu-vien")).toBe(true);
  });

  it("hiện đủ mọi mục khi đã đăng nhập", () => {
    expect(visibleNav(STUDENT_NAV, true)).toHaveLength(STUDENT_NAV.length);
  });
});

describe("cấu hình điều hướng", () => {
  // Guideline trang 12: bottom nav mobile có 4 mục + nút "Tất cả" là 5 ô.
  it("có đúng 4 mục primary cho bottom nav", () => {
    expect(STUDENT_NAV.filter((i) => i.primary)).toHaveLength(4);
  });

  it("mọi mục tổ tiên đều được đánh dấu exact", () => {
    for (const nav of [STUDENT_NAV, ADMIN_NAV]) {
      for (const a of nav) {
        const laToTien = nav.some((b) => b !== a && b.href.startsWith(`${a.href}/`));
        if (laToTien) expect(a.exact, `${a.href} là tổ tiên nhưng thiếu exact`).toBe(true);
      }
    }
  });

  it("mục Sắp ra mắt không trùng route đã tồn tại", () => {
    for (const i of STUDENT_NAV.filter((x) => x.comingSoon)) {
      expect(i.href.startsWith("/")).toBe(true);
    }
  });

  it("không có href trùng nhau", () => {
    for (const nav of [STUDENT_NAV, ADMIN_NAV]) {
      expect(new Set(nav.map((i) => i.href)).size).toBe(nav.length);
    }
  });
});

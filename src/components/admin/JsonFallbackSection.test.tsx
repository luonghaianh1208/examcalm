import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JsonFallbackSection } from "./JsonFallbackSection";

/**
 * Duong nhap JSON van duoc giu lai vi mot ly do co that: khi co thang do da
 * tham dinh, dan ca bai trong 5 giay hon la go tay 20 cau. Nhung no phai NAM
 * AN trong muc mo rong, de giao vien khong ranh ky thuat khong thay vuong.
 *
 * Chieu du lieu chi di MOT HUONG: JSON -> form, khi bam "Ap dung". Dong bo hai
 * chieu theo tung phim go la nguon sinh loi khong can thiet.
 */
describe("JsonFallbackSection", () => {
  it("dat san JSON hien tai vao o, de admin sao chep ra duoc", () => {
    render(<JsonFallbackSection jsonHienTai='{"title":"A"}' onApply={vi.fn()} />);
    expect(screen.getByLabelText("Nội dung dạng JSON")).toHaveValue('{"title":"A"}');
  });

  it("bam Ap dung thi goi onApply voi noi dung trong o", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<JsonFallbackSection jsonHienTai="{}" onApply={onApply} />);

    const o = screen.getByLabelText("Nội dung dạng JSON");
    await user.clear(o);
    await user.type(o, '{{"title":"Moi"}');

    await user.click(screen.getByRole("button", { name: "Áp dụng JSON" }));
    expect(onApply).toHaveBeenCalledWith('{"title":"Moi"}');
  });

  it("khong goi onApply neu admin chua bam nut", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<JsonFallbackSection jsonHienTai="{}" onApply={onApply} />);

    await user.type(screen.getByLabelText("Nội dung dạng JSON"), "x");
    expect(onApply).not.toHaveBeenCalled();
  });
});

import { describe, it, expect } from "vitest";
import { nextItemId } from "./next-item-id";

/**
 * Dung chung cho buoc CBT (tien to "s") va cau hoi bai test (tien to "q").
 * Diem cot yeu: id da co KHONG bao gio bi danh so lai — bai lam cu cua hoc
 * sinh khoa theo chinh nhung id nay (cbtSessions.answers, testAnswers.answers).
 */
describe("nextItemId", () => {
  it("sinh id dau tien khi chua co gi", () => {
    expect(nextItemId("s", [])).toBe("s1");
  });

  it("sinh id tiep theo khi day du lien tuc", () => {
    expect(nextItemId("q", ["q1", "q2", "q3"])).toBe("q4");
  });

  it("khong tai su dung id da bi xoa o giua", () => {
    // s2 da bi xoa. Tra ve "s2" se khien bai lam cu cua hoc sinh o buoc s2
    // bong dung dinh vao mot buoc hoan toan khac.
    expect(nextItemId("s", ["s1", "s3"])).toBe("s4");
  });

  it("van sinh duoc id khi cac id hien co khong theo quy uoc so", () => {
    expect(nextItemId("s", ["buoc-a", "buoc-b"])).toBe("s3");
  });
});

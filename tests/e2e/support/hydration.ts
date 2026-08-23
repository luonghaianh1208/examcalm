import { expect, type Locator } from "@playwright/test";

/**
 * Bấm chọn MỘT radio và xác nhận nó thực sự "dính" trước khi coi là xong.
 *
 * TestRunner render radio dạng controlled component (`checked={state}`).
 * Trang /test/[testId] là Server Component nên HTML (kể cả các radio) có mặt
 * trong DOM gần như ngay lập tức — SỚM HƠN lúc bundle client hydrate xong.
 * Nếu Playwright click vào một radio TRƯỚC khi React hydrate, trình duyệt vẫn
 * cho phép đổi trạng thái DOM tạm thời (chưa có listener nào chặn), nhưng
 * ngay khi React hydrate xong, nó reconcile lại theo state ban đầu (answers
 * rỗng) và XÓA MẤT lựa chọn đó — nút "Xem kết quả" kẹt ở trạng thái disabled
 * mãi mãi dù đã "click" đủ số câu.
 *
 * `expect(async () => {...}).toPass()` là cơ chế polling CHÍNH THỨC của
 * Playwright: thử lại (click rồi kiểm tra) tới khi thực sự đúng hoặc hết
 * timeout — không phải một `waitForTimeout()` đoán mò khoảng chờ hydrate.
 */
export async function clickAndConfirmChecked(locator: Locator): Promise<void> {
  await expect(async () => {
    await locator.click();
    await expect(locator).toBeChecked();
  }).toPass({ timeout: 10_000 });
}

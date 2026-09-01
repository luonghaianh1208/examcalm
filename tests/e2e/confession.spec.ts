/**
 * Confession — kiểm đúng một điều, nhưng là điều quan trọng nhất:
 * BÀI CHƯA AI DUYỆT KHÔNG BAO GIỜ LỌT RA BẢNG TIN CÔNG KHAI.
 *
 * Chạy trong đúng tình trạng production hiện tại: tính năng bật, provider AI
 * CHƯA cấu hình. Khi đó pipeline kiểm duyệt phải rơi về `hold` cho mọi bài.
 * Nếu hàng rào này hỏng, một học sinh vị thành niên vừa kể chuyện riêng của
 * mình sẽ thấy nó hiện cho cả trường đọc mà không ai xem trước.
 *
 * Mỗi file E2E trong repo này tự đủ, không import chéo giữa các spec file.
 */
import { test, expect, type Page } from "@playwright/test";
import { verifyEmailViaEmulator } from "./support/auth-emulator";
import { skipOnboarding } from "./support/skip-onboarding";
import { seedConfessionEnabledWithoutAi, clearAiConfig } from "./support/seed-ai";

const PASSWORD = "matkhau12345";

function uniqueEmail(): string {
  return `hs-conf-${process.env.PW_RUN_ID ?? "local"}-${Math.floor(Math.random() * 1e9)}@example.com`;
}

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/dang-ky");
  await expect(async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill(PASSWORD);
    await page.getByLabel("Biệt danh").fill("Mèo thử nghiệm Conf");
    await page.getByLabel("Trường").fill("THPT Thử Nghiệm");
    await page.getByRole("button", { name: /tạo tài khoản/i }).click();
    await expect(page).toHaveURL(/\/xac-thuc-email/, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}

async function verifyEmailAndWaitForSessionRefresh(page: Page, email: string): Promise<void> {
  await verifyEmailViaEmulator(email);
  await skipOnboarding(email);
  await expect(async () => {
    const daCapLai = page
      .waitForResponse(
        (res) => res.url().includes("/api/session") && res.request().method() === "POST",
        { timeout: 5_000 },
      )
      .catch(() => null);
    await page.goto("/xac-thuc-email");
    if ((await daCapLai) === null) throw new Error("Chưa cấp lại session cookie");
  }).toPass({ timeout: 30_000 });
}

test.describe("Confession — tính năng TẮT mặc định", () => {
  // 60s thay vì mặc định 30s: ghi Firestore chậm hơn hẳn khi E2E chạy kèm
  // emulator functions — mọi ghi còn phải đi qua lớp trigger.
  test.beforeAll(async () => { test.setTimeout(60_000); await clearAiConfig(); });

  test("chưa bật thì học sinh thấy lời giải thích, không thấy ô gửi bài", async ({ page }) => {
    await page.goto("/confession");
    await expect(page.getByText(/mục này chưa mở/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /gửi bài/i })).toHaveCount(0);
  });
});

test.describe("Confession — đã bật nhưng CHƯA cấu hình AI", () => {
  test.beforeAll(async () => { test.setTimeout(60_000); await seedConfessionEnabledWithoutAi(); });
  test.afterAll(async () => { test.setTimeout(60_000); await clearAiConfig(); });

  test("bài gửi lên rơi vào hàng chờ duyệt và KHÔNG hiện ở bảng tin công khai", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    await verifyEmailAndWaitForSessionRefresh(page, email);

    const noiDung = `Bài thử nghiệm ${Date.now()} — không được tự động đăng.`;

    await page.goto("/confession");
    await page.getByRole("textbox", { name: /bạn muốn kể điều gì/i }).fill(noiDung);
    await page.getByRole("button", { name: /gửi bài/i }).click();

    await expect(page.getByText(/đã gửi/i)).toBeVisible({ timeout: 15_000 });

    // Trạng thái phải là "chờ thầy cô đọc" — chưa cấu hình AI thì không có
    // đường nào tới auto_approved.
    await expect(page.getByText(/chờ thầy cô đọc/i)).toBeVisible({ timeout: 20_000 });

    // Và đây là hàng rào thật sự: nội dung KHÔNG được xuất hiện ở bảng tin.
    // Tải lại trang để chắc chắn đọc dữ liệu mới nhất từ server.
    await page.reload();
    const bangTin = page.getByRole("heading", { name: "Bảng tin" }).locator("..");
    await expect(bangTin.getByText(noiDung)).toHaveCount(0);
  });

  test("nói rõ trước khi gửi rằng bài được đọc trước và danh tính có lưu lại", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    await verifyEmailAndWaitForSessionRefresh(page, email);

    await page.goto("/confession");
    // Hứa "hoàn toàn ẩn danh" rồi vẫn lưu authorUid là nói dối học sinh — hai
    // câu này phải có mặt TRƯỚC nút gửi.
    await expect(page.getByText(/được kiểm tra trước khi hiện công khai/i)).toBeVisible();
    await expect(page.getByText(/hệ thống có lưu lại để thầy cô hỏi thăm/i)).toBeVisible();
  });
});

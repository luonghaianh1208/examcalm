/**
 * Music Hub — kiểm đúng hai điều làm nên tính năng kho riêng:
 *
 *   1. Khách chưa đăng nhập vẫn NGHE được kho chung, chỉ không lưu được.
 *      Đây là lời hứa "dùng được mà không cần tài khoản" của trang chủ, và là
 *      thứ dễ vỡ nhất khi thêm một tính năng đòi đăng nhập vào cùng trang.
 *   2. Học sinh lưu một bài thì bài đó thật sự xuất hiện trong kho riêng —
 *      tức là đường ghi Firestore và rules `isOwner` đều thông.
 *
 * Mỗi file E2E trong repo này tự đủ, không import chéo giữa các spec file.
 */
import { test, expect, type Page } from "@playwright/test";
import { verifyEmailViaEmulator } from "./support/auth-emulator";
import { skipOnboarding } from "./support/skip-onboarding";
import { seedPublishedTrack, E2E_TRACK_TITLE } from "./support/seed-music";

const PASSWORD = "matkhau12345";

function uniqueEmail(): string {
  return `hs-music-${process.env.PW_RUN_ID ?? "local"}-${Math.floor(Math.random() * 1e9)}@example.com`;
}

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/dang-ky");
  await expect(async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill(PASSWORD);
    await page.getByLabel("Biệt danh").fill("Mèo thử nghiệm Nhạc");
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

test.describe("Music Hub", () => {
  test.beforeAll(async () => { await seedPublishedTrack(); });

  test("khách nghe được kho chung nhưng không có nút lưu", async ({ page }) => {
    await page.goto("/music");
    await expect(page.getByText(E2E_TRACK_TITLE)).toBeVisible();
    await expect(page.getByRole("button", { name: /^phát$/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^lưu$/i })).toHaveCount(0);
  });

  test("học sinh lưu bài từ kho chung thì bài hiện trong kho riêng", async ({ page }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail();
    await signUp(page, email);
    await verifyEmailAndWaitForSessionRefresh(page, email);

    await page.goto("/music");
    // Chờ kho riêng tải xong — trước đó nút lưu chưa mang trạng thái thật.
    await expect(page.getByText(/chưa lưu bài nào/i)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /^lưu$/i }).first().click();

    // Bài phải xuất hiện DƯỚI mục "Đã lưu từ kho trường", nên tiêu đề giờ hiện
    // hai lần: một ở kho chung, một ở kho riêng.
    await expect(page.getByText(E2E_TRACK_TITLE)).toHaveCount(2, { timeout: 20_000 });
    await expect(page.getByText(/chưa lưu bài nào/i)).toHaveCount(0);
  });
});

/**
 * KHÔNG PHẢI TEST — đây là công cụ chụp ảnh màn hình để soát giao diện bằng
 * mắt, chạy trong đúng môi trường emulator nên các trang cần Firestore (Thư
 * viện, Bài kiểm tra, Dashboard) mới render được.
 *
 *   SHOTS=1 SHOTS_DIR=... npx firebase emulators:exec --only auth,firestore \
 *     "npm run seed && npx playwright test shots"
 *
 * Mặc định bị BỎ QUA để không chạy trong CI. Đặt SHOTS=1 để bật.
 *
 * Vì sao cần: build xanh và test xanh không chứng minh giao diện đúng. Riêng
 * đợt dựng lại theo Brand Guideline đã có bốn lỗi chỉ lộ ra khi nhìn ảnh chụp.
 */
import { test, expect, type Page } from "@playwright/test";
import { verifyEmailViaEmulator } from "./support/auth-emulator";
import { skipOnboarding } from "./support/skip-onboarding";

const BAT = process.env.SHOTS === "1";
const DIR = process.env.SHOTS_DIR ?? "test-results/shots";
const PASSWORD = "MatKhau!123";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

function uniqueEmail(): string {
  return `shots-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/dang-ky");
  await expect(async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill(PASSWORD);
    await page.getByLabel("Biệt danh").fill("Mèo thử nghiệm");
    await page.getByLabel("Trường").fill("THPT Thử Nghiệm");
    await page.getByRole("button", { name: /tạo tài khoản/i }).click();
    await expect(page).toHaveURL(/\/xac-thuc-email/, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}

/**
 * Cookie phiên được cấp LÚC ĐĂNG KÝ nên vẫn mang emailVerified = false. Ghé
 * /xac-thuc-email để VerifyEmailNotice cấp lại cookie — nếu không, trang Nhật
 * ký chỉ hiện lời nhắc xác thực chứ không hiện ô ghi.
 */
async function capLaiSession(page: Page): Promise<void> {
  await expect(async () => {
    const daCapLai = page
      .waitForResponse(
        (res) => res.url().includes("/api/session") && res.request().method() === "POST",
        { timeout: 5_000 },
      )
      .catch(() => null);
    await page.goto("/xac-thuc-email");
    if ((await daCapLai) === null) throw new Error("Chưa cấp lại session cookie");
  }).toPass({ timeout: 20_000 });
}

test.describe("chup anh", () => {
  test.skip(!BAT, "Đặt SHOTS=1 để bật.");

  for (const vp of VIEWPORTS) {
    test(`trang cong khai - ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const routes: Array<[string, string]> = [
        ["/", "home"],
        ["/thu-vien", "thu-vien"],
        ["/test", "test"],
      ];
      for (const [route, slug] of routes) {
        await page.goto(route);
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${DIR}/${slug}-${vp.name}.png`, fullPage: true });
      }
    });

    test(`dashboard va nhat ky - ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const email = uniqueEmail();
      await signUp(page, email);
      await verifyEmailViaEmulator(email);
      await skipOnboarding(email);
      await capLaiSession(page);

      // Ghi vài lần cảm xúc để biểu đồ có dữ liệu thật thay vì chỉ thấy trạng
      // thái rỗng — chính đường vẽ mới là thứ cần nhìn tận mắt.
      for (const score of ["4", "7", "6"]) {
        await page.goto("/nhat-ky");
        await page.getByRole("slider", { name: /điểm cảm xúc/i }).fill(score);
        await page.getByRole("button", { name: /^lưu vào nhật ký$/i }).click();
        await expect(page.getByText("Đã lưu.")).toBeVisible({ timeout: 10_000 });
      }

      await page.goto("/nhat-ky");
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${DIR}/nhat-ky-${vp.name}.png`, fullPage: true });

      await page.goto("/tien-trinh");
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${DIR}/dashboard-${vp.name}.png`, fullPage: true });
    });
  }
});

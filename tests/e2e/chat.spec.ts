/**
 * Bề mặt "Hỏi về web app" (WebAppHelpChat + callable askWebAppHelp).
 *
 * Thay cho spec của chatbot tâm sự cũ: theo Brand Guideline §6.2 và quyết định
 * 1c của chủ sản phẩm, màn Trò chuyện giờ là trợ giúp CÁCH DÙNG SẢN PHẨM, trả
 * lời từ FAQ trên server chứ không gọi mô hình ngôn ngữ.
 *
 * Vì vậy spec này KHÔNG seed cấu hình AI: điểm mấu chốt cần chứng minh là bề
 * mặt này chạy được ngay cả khi AI đang tắt hoàn toàn — đúng tình trạng
 * production hiện tại.
 *
 * Mỗi file E2E trong repo này tự đủ, không import chéo giữa các spec file.
 */
import { test, expect, type Page } from "@playwright/test";
import { verifyEmailViaEmulator } from "./support/auth-emulator";
import { skipOnboarding } from "./support/skip-onboarding";

const PASSWORD = "matkhau12345";

function uniqueEmail(): string {
  return `hs-help-${process.env.PW_RUN_ID ?? "local"}-${Math.floor(Math.random() * 1e9)}@example.com`;
}

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/dang-ky");
  await expect(async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill(PASSWORD);
    await page.getByLabel("Biệt danh").fill("Mèo thử nghiệm Help");
    await page.getByLabel("Trường").fill("THPT Thử Nghiệm");
    await page.getByRole("button", { name: /tạo tài khoản/i }).click();
    await expect(page).toHaveURL(/\/xac-thuc-email/, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}

/**
 * Cookie phiên cấp lúc đăng ký vẫn mang emailVerified = false. Ghé
 * /xac-thuc-email để VerifyEmailNotice cấp lại — callable askWebAppHelp từ
 * chối khi email chưa xác thực.
 *
 * Dùng đúng kỹ thuật đợi POST /api/session thay vì networkidle: app giữ kết
 * nối Firestore realtime mở liên tục nên "network idle" có thể không bao giờ
 * xảy ra.
 */
async function verifyEmailAndWaitForSessionRefresh(page: Page, email: string): Promise<void> {
  await verifyEmailViaEmulator(email);
  await skipOnboarding(email);

  await expect(async () => {
    const sessionRefreshed = page
      .waitForResponse(
        (res) => res.url().includes("/api/session") && res.request().method() === "POST",
        { timeout: 5_000 },
      )
      .catch(() => null);
    await page.goto("/xac-thuc-email");
    if ((await sessionRefreshed) === null) {
      throw new Error("VerifyEmailNotice chưa cấp lại session cookie — thử lại.");
    }
  }).toPass({ timeout: 30_000 });
}

test.describe("Hỏi về web app", () => {
  test("nói rõ phạm vi TRƯỚC KHI học sinh gõ, và trả lời câu hỏi điều hướng kèm nút tới đúng màn hình", async ({
    page,
  }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    await verifyEmailAndWaitForSessionRefresh(page, email);

    await page.goto("/tro-chuyen");

    // Phản hồi 5.7: học sinh phải biết đây là trợ giúp cách dùng web, không
    // phải nơi tư vấn tâm lý — và biết TRƯỚC khi gõ.
    await expect(page.getByText(/không phải.*nơi tư vấn tâm lý/i)).toBeVisible();

    await page.getByRole("button", { name: "Nhật ký ở đâu?" }).click();

    await expect(page.getByText(/Nhật ký cảm xúc.*trong menu/i)).toBeVisible({ timeout: 15_000 });
    // Guideline §6.2: "ưu tiên deep link hoặc CTA tới đúng màn hình".
    await expect(page.getByRole("link", { name: /mở nhật ký cảm xúc/i })).toBeVisible();
  });

  test("câu hỏi ngoài phạm vi: nói rõ giới hạn thay vì bịa một chức năng", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    await verifyEmailAndWaitForSessionRefresh(page, email);

    await page.goto("/tro-chuyen");
    await page.getByRole("textbox", { name: /câu hỏi về cách dùng/i }).fill("Thủ đô nước Pháp là gì");
    await page.getByRole("button", { name: /^hỏi$/i }).click();

    await expect(page.getByText(/chỉ giúp được về cách dùng ExamCalm/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("tin nhắn có dấu hiệu khủng hoảng nhận đường an toàn kèm số 111, không phải câu FAQ", async ({
    page,
  }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    await verifyEmailAndWaitForSessionRefresh(page, email);

    await page.goto("/tro-chuyen");
    await page.getByRole("textbox", { name: /câu hỏi về cách dùng/i }).fill("em muốn chết");
    await page.getByRole("button", { name: /^hỏi$/i }).click();

    // Đây là rào chắn quan trọng nhất của cả bề mặt này: một bot trả lời "mình
    // chỉ hỗ trợ cách dùng web thôi" trong tình huống này tệ hơn hẳn việc
    // không có bot. Lớp an toàn phải chạy kể cả khi AI đang tắt.
    //
    // CỐ Ý khớp một câu RIÊNG của CRISIS_REPLY_TEXT chứ không phải chuỗi "111":
    // số 111 còn nằm ở footer trên mọi trang, nên getByText(/111/) sẽ xanh kể
    // cả khi chatbot không trả lời gì — một test xanh vì lý do sai còn tệ hơn
    // không có test.
    await expect(page.getByText(/mình không thể tiếp tục trò chuyện/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/người lớn em tin tưởng/i)).toBeVisible();
  });
});

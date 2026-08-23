import { test, expect, type Page } from "@playwright/test";
import { verifyEmailViaEmulator } from "./support/auth-emulator";

/** Emulator chấp nhận mọi email; mỗi lần chạy dùng một email khác để tránh trùng. */
function uniqueEmail(): string {
  return `hs-${process.env.PW_RUN_ID ?? "local"}-${Math.floor(Math.random() * 1e9)}@example.com`;
}

const PASSWORD = "matkhau12345";

/**
 * SignUpForm là "use client" — có một khoảng ngắn NGAY sau khi trang tải xong
 * nơi React chưa hydrate kịp để gắn onSubmit. Bấm "Tạo tài khoản" trong
 * khoảng đó khiến trình duyệt submit form theo kiểu GỐC (form không có
 * method/action) — tức GET về đúng URL hiện tại kèm mọi field trên query
 * string — thay vì gọi signUp() qua JS. Đường đi hỏng này không tạo tài
 * khoản (không có handler nào xử lý GET đó phía server) nên thử lại AN TOÀN.
 * Bọc trong expect(...).toPass() — cơ chế polling CHÍNH THỨC của Playwright —
 * để tự phục hồi một cách xác định, không đoán khoảng chờ hydrate bằng
 * waitForTimeout().
 */
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

test.describe("Học sinh", () => {
  test("đăng ký được và tạo hồ sơ", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);

    await expect(page).toHaveURL(/\/xac-thuc-email/);
    // Không dùng getByText(/kiểm tra hộp thư/i) trực tiếp — Next.js route
    // announcer (#__next-route-announcer__, dùng cho screen reader) lặp lại
    // đúng chữ của <h1>, khiến locator khớp 2 phần tử (strict mode violation).
    // Heading là phần tử NGƯỜI DÙNG thực sự nhìn thấy, nên scope vào đó.
    await expect(page.getByRole("heading", { name: /kiểm tra hộp thư/i })).toBeVisible();
  });

  test("vào được trang tiến trình sau khi đăng ký", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    await expect(page).toHaveURL(/\/xac-thuc-email/);

    await page.goto("/tien-trinh");
    await expect(page.getByRole("heading", { name: /tiến trình của bạn/i })).toBeVisible();
  });

  test("KHÔNG hiển thị chuỗi ngày hay streak ở trang tiến trình", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);

    await page.goto("/tien-trinh");
    // Scope vào các <section> nội dung (cảm xúc gần đây / lịch sử test), KHÔNG
    // tính đoạn giới thiệu đầu trang — đoạn đó CỐ Ý viết "không có chuỗi ngày
    // phải giữ" để trấn an, nên tự nó chứa cụm "chuỗi ngày" dù không có tính
    // năng streak nào cả. Assertion cần bắt tính năng streak THẬT (badge, số
    // đếm), không bắt nhầm câu trấn an phủ định nó.
    await expect(
      page.locator("main section").getByText(/streak|chuỗi ngày|ngày liên tiếp/i),
    ).toHaveCount(0);
  });

  test("đăng ký xong, header chuyển ngay sang trạng thái đã đăng nhập — không cần tải lại trang — và vẫn giữ nguyên sau khi xác thực email qua link của Auth Emulator", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    await expect(page).toHaveURL(/\/xac-thuc-email/);

    // Pin bug đã tìm thấy thủ công ở Task 23: ngay sau đăng ký, SiteHeader (Server
    // Component đọc session cookie) phải cập nhật NGAY nhờ router.refresh() —
    // không được kẹt lại ở trạng thái "chưa đăng nhập" cho tới khi người dùng tự
    // reload trang.
    await expect(page.getByRole("link", { name: "Hồ sơ" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Đăng nhập" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Đăng ký" })).toHaveCount(0);

    // Dùng đúng oobCode mà Auth Emulator sinh ra cho link xác thực email — KHÔNG
    // gửi/đọc email thật (xem giải thích ở tests/e2e/support/auth-emulator.ts).
    await verifyEmailViaEmulator(email);

    // Xác thực xong, header vẫn phải giữ nguyên trạng thái đã đăng nhập.
    await page.reload();
    await expect(page.getByRole("link", { name: "Hồ sơ" })).toBeVisible();
  });

  test("học sinh đăng nhập rồi vào thẳng /tien-trinh thấy được trang, không bị lỗi tải", async ({ browser }) => {
    const email = uniqueEmail();

    // Tạo tài khoản trước, trong một context riêng — mô phỏng đúng tình huống gây
    // ra bug: một phiên trình duyệt MỚI (không mang theo trạng thái Auth đã "ấm"
    // sẵn từ lúc vừa đăng ký) đăng nhập rồi vào thẳng /tien-trinh.
    const setupContext = await browser.newContext();
    try {
      const setupPage = await setupContext.newPage();
      await signUp(setupPage, email);
      await expect(setupPage).toHaveURL(/\/xac-thuc-email/);
    } finally {
      await setupContext.close();
    }

    const signInContext = await browser.newContext();
    try {
      const page = await signInContext.newPage();
      await page.goto("/dang-nhap");
      // Cùng lý do hydration race đã giải thích ở signUp() phía trên — SignInForm
      // cũng là "use client" với <form onSubmit>.
      await expect(async () => {
        await page.getByLabel("Email").fill(email);
        await page.getByLabel("Mật khẩu").fill(PASSWORD);
        await page.getByRole("button", { name: /^đăng nhập$/i }).click();

        // SignInForm điều hướng thẳng tới /tien-trinh khi không có ?tiep-tuc= —
        // đúng đường đi từng gây ra race ensureAuthReady() (xem comment trong
        // src/lib/firestore/attempts.ts và moods.ts): Firestore đọc TRƯỚC KHI
        // request.auth kịp khôi phục sẽ bị Rules từ chối.
        await expect(page).toHaveURL(/\/tien-trinh/, { timeout: 3_000 });
      }).toPass({ timeout: 20_000 });
      await expect(page.getByRole("heading", { name: /tiến trình của bạn/i })).toBeVisible();

      // Không được có banner báo lỗi tải (PERMISSION_DENIED do race) ở cả hai mục.
      await expect(page.getByText(/chưa tải được lịch sử làm test/i)).toHaveCount(0);
      await expect(page.getByText(/chưa tải được ghi chép cảm xúc/i)).toHaveCount(0);

      // Thay vào đó phải thấy trạng thái rỗng hợp lệ (tài khoản mới, chưa có dữ liệu).
      await expect(page.getByText(/bạn chưa làm bài test nào/i)).toBeVisible();
    } finally {
      await signInContext.close();
    }
  });
});

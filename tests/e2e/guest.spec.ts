import { test, expect, type Page } from "@playwright/test";
import { seedSampleContentTest } from "./support/seed-sample-test";
import { clickAndConfirmChecked } from "./support/hydration";

/**
 * Vào /test rồi bấm link bài test mẫu (MẪU). Next `<Link>` điều hướng phía
 * client (router.push()) — click() của Playwright chỉ đợi sự kiện click nổ
 * ra, KHÔNG đợi điều hướng bất đồng bộ đó hoàn tất (khác với một thẻ <a>
 * tải lại cả trang, thứ Playwright tự đợi). Nếu đọc DOM ngay sau click(),
 * có thể vẫn đang đứng ở trang /test cũ. Đợi một phần tử CHỈ có ở trang đích
 * (nút "Xem kết quả") xuất hiện — expect(...).toBeVisible() tự poll tới khi
 * đúng — là cách xác định để đồng bộ, không phải một waitForTimeout() đoán mò.
 */
async function openSampleTest(page: Page): Promise<void> {
  await page.goto("/test");
  await page.getByRole("link", { name: /MẪU/ }).click();
  // Bài test mở ra ở MÀN GIỚI THIỆU (số câu, thời gian, thẩm định, lời miễn
  // trừ) rồi mới tới câu hỏi — xem TestRunner. Nút "Bắt đầu" chỉ có ở trang
  // đích nên vẫn dùng được làm mốc đồng bộ điều hướng.
  const batDau = page.getByRole("button", { name: /^bắt đầu$/i });
  // Timeout rộng: Next <Link> điều hướng phía client, và máy bận thì bước này
  // lâu hơn mặc định 5s — đúng lớp lỗi mà chú thích ở trên hàm này nói tới.
  await expect(batDau).toBeVisible({ timeout: 20_000 });
  await batDau.click();
}

/**
 * Trả lời "Không bao giờ" cho mọi câu.
 *
 * Giờ mỗi màn hình chỉ có MỘT câu, nên phải chọn rồi bấm "Tiếp theo" lặp lại
 * cho tới câu cuối — câu cuối không còn nút "Tiếp theo" mà là "Xem kết quả".
 */
async function answerAllWithNever(page: Page): Promise<void> {
  // Trần lặp: bảo vệ khỏi vòng lặp vô hạn nếu luồng đổi lần nữa. Bài test mẫu
  // chỉ có vài câu nên 30 là dư sức mà vẫn dừng nhanh khi có lỗi.
  for (let i = 0; i < 30; i++) {
    await clickAndConfirmChecked(page.getByRole("radio", { name: "Không bao giờ" }));
    const tiepTheo = page.getByRole("button", { name: /tiếp theo/i });
    if ((await tiepTheo.count()) === 0) return;
    await tiepTheo.click();
  }
  throw new Error("Không tới được câu cuối sau 30 bước — luồng làm bài có thể đã đổi.");
}

test.describe("Khách chưa đăng nhập", () => {
  // scripts/seed.mts hiện chỉ seed một bài test THẬT (GAD-7, isSampleContent=false)
  // — không còn bài test mẫu (MẪU) nào nữa. Ba test đầu bên dưới cần một bài
  // test gắn cờ isSampleContent=true để verify banner cảnh báo, nên tự seed
  // thêm một bài test riêng cho E2E (xem tests/e2e/support/seed-sample-test.ts).
  test.beforeAll(async () => {
    // 60s thay vì mặc định 30s: từ khi E2E chạy kèm emulator functions, mọi
    // ghi Firestore còn phải đi qua lớp trigger nên bước seed chậm hơn hẳn.
    // Ngưỡng cũ nằm sát mép và hỏng lúc máy bận.
    test.setTimeout(60_000);
    await seedSampleContentTest();
  });

  test("làm được test và thấy kết quả mà không cần tài khoản, thấy cả disclaimer lẫn banner nội dung mẫu", async ({ page }) => {
    await openSampleTest(page);
    await answerAllWithNever(page);

    await page.getByRole("button", { name: /xem kết quả/i }).click();

    await expect(page.getByText(/tổng điểm của bạn/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /đăng ký để lưu kết quả/i })).toBeVisible();

    // Bài test mẫu (isSampleContent=true) phải luôn hiện CẢ disclaimer lẫn banner
    // cảnh báo trên màn hình kết quả — không chỉ lúc đang làm bài.
    await expect(page.getByText(/công cụ tự tìm hiểu, không phải chẩn đoán/i)).toBeVisible();
    await expect(page.getByText(/nội dung mẫu chưa thẩm định/i)).toBeVisible();
  });

  test("kết quả được giữ trong sessionStorage chứ không ghi Firestore", async ({ page }) => {
    await openSampleTest(page);
    await answerAllWithNever(page);
    await page.getByRole("button", { name: /xem kết quả/i }).click();
    await expect(page.getByText(/tổng điểm của bạn/i)).toBeVisible();

    const stored = await page.evaluate(() => sessionStorage.getItem("examcalm:guest-results"));
    expect(stored).toContain("score");
    const local = await page.evaluate(() => localStorage.length);
    expect(local).toBe(0);
  });

  test("luôn thấy banner nội dung mẫu", async ({ page }) => {
    await openSampleTest(page);
    await expect(page.getByText(/nội dung mẫu/i)).toBeVisible();
  });

  test("bị chuyển về trang đăng nhập khi vào khu vực học sinh, giữ nguyên tiep-tuc", async ({ page }) => {
    await page.goto("/tien-trinh");
    await expect(page).toHaveURL(/\/dang-nhap/);

    const url = new URL(page.url());
    expect(url.searchParams.get("tiep-tuc")).toBe("/tien-trinh");
  });

  test("bị chuyển về trang đăng nhập khi vào khu vực quản trị, giữ nguyên tiep-tuc", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dang-nhap/);

    const url = new URL(page.url());
    expect(url.searchParams.get("tiep-tuc")).toBe("/admin");
  });

  test("đọc được thư viện công khai", async ({ page }) => {
    await page.goto("/thu-vien");
    await expect(page.getByRole("link", { name: /kỹ thuật thở/i })).toBeVisible();
  });
});

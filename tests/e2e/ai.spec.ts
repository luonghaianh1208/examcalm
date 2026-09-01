import { test, expect, type Page } from "@playwright/test";
import { verifyEmailViaEmulator } from "./support/auth-emulator";
import { seedAiEnabled, clearAiConfig } from "./support/seed-ai";
import { skipOnboarding } from "./support/skip-onboarding";

/**
 * E2E cho lớp AI (Spec #3, Task 13). `aiConfig` mặc định TRỐNG trong emulator (không seed gì) —
 * đúng trạng thái production lúc mới ship (im lặng cho tới khi một admin bật thủ công, xem
 * docs/ai-go-live-checklist.md). Hai kịch bản đầu cố tình KHÔNG seed gì để pin đúng trạng thái
 * mặc định đó; kịch bản thứ ba seed `systemConfig/aiConfig` + `systemConfig/aiPublic` để chứng
 * minh đường đi NGƯỢC LẠI — cổng thực sự mở khi được cấu hình đúng.
 *
 * GIỚI HẠN CỐ Ý (đọc trước khi mở rộng file này): kịch bản "AI đã bật" bên dưới lái toàn bộ
 * luồng CLIENT thật — màn hình đồng ý (AiConsentSection), cổng aiOptIn/aiPublic của
 * ReflectionCard, và một lượt gọi callable `generateReflection` THẬT qua Functions Client SDK —
 * nhưng KHÔNG có gì lắng nghe ở Functions Emulator (cổng 5001) trong suite này, nên bản thân
 * Cloud Function generateReflection KHÔNG chạy. Đây không phải một khoảng trống bị bỏ sót:
 *
 *   1. `npm run test:e2e` (package.json) chỉ khởi động `--only auth,firestore` — không có
 *      `functions`. Thêm `functions` vào đó đòi hỏi `functions/lib` đã build VÀ
 *      `functions/node_modules` đã cài.
 *   2. Job "app" trong .github/workflows/ci.yml (nơi `npm run test:e2e` thực sự chạy trong CI)
 *      CỐ Ý KHÔNG BAO GIỜ chạy `npm ci --prefix functions` — xem comment ngay đầu job đó: đây là
 *      ranh giới kiến trúc có chủ đích, để một lỗi kiểu "root tsconfig lỡ type-check cả
 *      functions/src" FAIL ngay ở CI thay vì chỉ lộ ra lúc deploy thật (bug thật đã từng xảy ra).
 *      Bắt E2E phụ thuộc vào functions/ đã build sẽ phá đúng ranh giới đó.
 *   3. File scope của Task 13 (task-13-brief.md) chỉ liệt kê tạo tests/e2e/ai.spec.ts +
 *      docs/ai-provider-setup.md và sửa README.md — không phải một quyết định tái cấu trúc CI/
 *      tooling toàn repo.
 *
 *   Vì vậy một E2E kéo dài tới tận Cloud Function THẬT (chạy trên Functions Emulator, gọi tới
 *   một OpenAI-compatible server giả cục bộ để không đụng mạng thật) KHÔNG khả thi trong khuôn
 *   khổ hiện tại của repo mà không đổi package.json/CI — nằm ngoài phạm vi Task 13. Cái mà kịch
 *   bản dưới đây THỰC SỰ chứng minh — và là phần trước đây hoàn toàn không có E2E nào phủ tới —
 *   là toàn bộ đường dây client thật: đồng ý → cổng aiOptIn/aiPublic → gọi callable thật. Business
 *   logic BÊN TRONG generateReflection (kill switch, quota, an toàn, ghép prompt, ghi
 *   aiJournalOutputs) đã được kiểm chứng đầy đủ, có emulator Firestore thật, ở
 *   functions/src/ai/generateReflection.test.ts (17 case) với một callChatCompletion giả được
 *   tiêm qua deps — đó là tín hiệu "đầu-cuối không cần mạng thật" gần nhất hiện có cho riêng phần
 *   đó, và nó đã tồn tại từ trước Task 13.
 */

function uniqueEmail(): string {
  return `hs-ai-${process.env.PW_RUN_ID ?? "local"}-${Math.floor(Math.random() * 1e9)}@example.com`;
}

const PASSWORD = "matkhau12345";

/** Giống hệt signUp() ở tests/e2e/student.spec.ts — xem comment ở đó cho lý do dùng toPass()
 *  (race hydrate của SignUpForm). Không import chéo giữa hai spec file — mỗi file E2E trong repo
 *  này tự đủ (xem tests/e2e/support/seed-sample-test.ts, cùng phong cách không chia sẻ). */
async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/dang-ky");
  await expect(async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill(PASSWORD);
    await page.getByLabel("Biệt danh").fill("Mèo thử nghiệm AI");
    await page.getByLabel("Trường").fill("THPT Thử Nghiệm");
    await page.getByRole("button", { name: /tạo tài khoản/i }).click();
    await expect(page).toHaveURL(/\/xac-thuc-email/, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}

/**
 * Xác thực email qua Auth Emulator rồi đợi tới khi session cookie thật sự phản ánh
 * `emailVerified: true` — cần cho MoodWidget.canSave (xem src/app/layout.tsx). Session cookie
 * "đông cứng" claims lúc mint (xem src/lib/firebase/session.ts); VerifyEmailNotice
 * (src/components/auth/VerifyEmailNotice.tsx) chỉ tự phát hiện và cấp lại cookie khi trang
 * /xac-thuc-email được MOUNT, bằng cách POST `/api/session` (establishSession(), xem
 * src/lib/auth-client.ts) rồi router.refresh() — không có tín hiệu DOM nào báo "đã cấp lại
 * cookie", nên đợi ĐÚNG request POST đó hoàn tất thay vì `waitForLoadState("networkidle")`: app
 * này giữ kết nối Firestore realtime + HMR dev server mở liên tục, nên "network idle" có thể
 * KHÔNG BAO GIỜ xảy ra và làm treo test. Nếu detectVerification() chưa thấy verified (race hiếm
 * với Auth Emulator) thì không có POST nào được gửi — `waitForResponse` hết hạn (timeout ngắn,
 * 5s), toPass() ở ngoài thử lại toàn bộ khối một cách xác định.
 *
 * Cũng tự bỏ qua WelcomeDialog/OnboardingTour (skipOnboarding) — hai UI đó CHỈ đủ điều kiện hiện
 * khi `emailVerified === true` (xem OnboardingController.tsx), tức đúng lúc hàm này làm cho điều
 * kiện đó trở thành true lần đầu tiên. WelcomeDialog là modal focus-trap che kín màn hình — không
 * bỏ qua, mọi click vào nút "Mở nhật ký cảm xúc" ở các bước sau sẽ không tới được nút thật, và
 * toPass() ở dưới sẽ hết giờ vì "Lưu vào nhật ký" không bao giờ xuất hiện. Onboarding không liên
 * quan gì tới lớp AI đang kiểm chứng ở file này (xem giải thích ở skip-onboarding.ts).
 */
async function verifyEmailAndWaitForCanSave(page: Page, email: string): Promise<void> {
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

    await page.goto("/tien-trinh");
    await page.getByRole("button", { name: /mở nhật ký cảm xúc/i }).click();
    await expect(page.getByRole("button", { name: /^lưu vào nhật ký$/i })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
}

async function saveMoodEntry(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^lưu vào nhật ký$/i }).click();
  await expect(page.getByText(/đã lưu vào nhật ký cảm xúc/i)).toBeVisible();
}

/**
 * Trang /ho-so cũng có MỘT checkbox KHÁC không liên quan gì tới AI — "Tham gia nghiên cứu"
 * (ResearchConsentForm, luôn hiện, không điều kiện gì). `page.getByRole("checkbox")` một mình sẽ
 * khớp CẢ HAI, nên mọi thao tác trên checkbox của AiConsentSection phải scope vào đúng <section>
 * chứa heading "Tính năng AI (không bắt buộc)".
 *
 * Task 10 (Spec #4): heading trước đây là "Phản chiếu AI" — đổi thành "Tính năng AI" ở Task 9
 * (AiConsentSection.tsx, Fix round 1 Finding 3) vì cùng MỘT ô tick giờ mở cả phản chiếu lẫn
 * chat, nên tiêu đề cũ mời "bật Phản chiếu AI" sai tên dưới cấu hình chỉ-bật-chat. Selector cũ
 * (`/phản chiếu ai/i`) không còn khớp gì — sửa lại đây để `npm run test:e2e` xanh trở lại.
 */
function aiConsentSection(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: /tính năng ai/i }) });
}

test.describe("AI — aiConfig trống (mặc định production lúc mới ship)", () => {
  test("học sinh chưa bật AI ghi được mood log bình thường, không thấy phần AI nào", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    await verifyEmailAndWaitForCanSave(page, email);

    // Panel đang mở sẵn từ verifyEmailAndWaitForCanSave (đã tìm thấy nút "Lưu vào nhật ký").
    await saveMoodEntry(page);

    // Không seed gì cho aiPublic -> ReflectionCard tự đọc cổng, thấy đóng, render null.
    await expect(page.getByText(/nội dung do ai tạo/i)).toHaveCount(0);
    await expect(page.getByRole("region", { name: /phản chiếu từ mèo/i })).toHaveCount(0);
  });

  test("vào Hồ sơ, thấy trạng thái 'chưa khả dụng' vì aiConfig trống", async ({ page }) => {
    const email = uniqueEmail();
    // Không cần xác thực email để xem trang Hồ sơ — requireUser() chỉ đòi đăng nhập.
    await signUp(page, email);

    await page.goto("/ho-so");
    const section = aiConsentSection(page);
    await expect(section).toBeVisible();
    await expect(section.getByText(/chưa khả dụng/i)).toBeVisible();
    await expect(section.getByRole("checkbox")).toHaveCount(0);
  });
});

test.describe("AI — đã cấu hình và bật (đường đi thuận)", () => {
  test.beforeAll(async () => {
    await seedAiEnabled("E2E Test Provider");
  });

  test.afterAll(async () => {
    // Dọn lại về trạng thái trống — các spec file khác chạy sau trong cùng lượt
    // `playwright test` (vd guest.spec.ts, student.spec.ts) không được kế thừa "AI đang bật".
    await clearAiConfig();
  });

  test("bật AI qua màn hình đồng ý thật, ghi mood log, thẻ phản chiếu xuất hiện với nhãn 'Nội dung do AI tạo'", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    await verifyEmailAndWaitForCanSave(page, email);

    // Điều hướng sang Hồ sơ — panel mood đang mở dở từ helper trên bị bỏ lại (chưa lưu gì, chưa
    // cần lưu ở bước này); mở lại một panel MỚI ở /tien-trinh sau khi bật đồng ý xong.
    await page.goto("/ho-so");

    // Cổng đã mở (seedAiEnabled ở beforeAll) -> AiConsentSection hiện nút bật thật, không phải
    // trạng thái "chưa khả dụng". Scope vào đúng section — /ho-so có một checkbox KHÁC không
    // liên quan (Tham gia nghiên cứu), xem aiConsentSection().
    const section = aiConsentSection(page);
    await expect(section.getByText(/chưa khả dụng/i)).toHaveCount(0);
    const checkbox = section.getByRole("checkbox");
    await expect(checkbox).not.toBeChecked();
    await checkbox.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("E2E Test Provider");
    await dialog.getByRole("button", { name: /đồng ý, bật tính năng/i }).click();

    await expect(checkbox).toBeChecked();

    // Ghi một mood log thật qua UI thật rồi để ReflectionCard tự gọi callable
    // generateReflection thật (xem giới hạn đã ghi ở đầu file: Functions Emulator không chạy
    // trong suite này, nên bản thân lượt gọi model không thành công — điều ĐANG được chứng minh
    // ở đây là cổng consent/aiOptIn/aiPublic thật sự mở, không phải nội dung phản chiếu).
    await page.goto("/tien-trinh");
    await page.getByRole("button", { name: /mở nhật ký cảm xúc/i }).click();
    await saveMoodEntry(page);

    // M11 (final whole-branch review): assertion cũ chỉ kiểm tra label "Nội dung do AI tạo" và
    // vùng region luôn HIỆN — cả hai render KHÔNG điều kiện ngay khi gate="open"
    // (ReflectionCard.tsx), bất kể requestReflection() có thực sự được gọi hay không. Xoá thẳng
    // lượt gọi callable khỏi component vẫn để test này xanh. Khẳng định thêm việc thẻ THẬT SỰ đi
    // qua trạng thái đang tải rồi rơi vào trạng thái lỗi (Functions Emulator không chạy trong
    // suite này — xem giới hạn ghi ở đầu file — nên lượt gọi callable thật sự THẤT BẠI), với
    // đúng câu chữ lỗi trung tính do mapReflectionErrorMessage() sinh ra, để xoá lượt gọi đó làm
    // test đỏ thay vì âm thầm xanh.
    const region = page.getByRole("region", { name: /phản chiếu từ mèo/i });
    await expect(region).toBeVisible();
    await expect(page.getByText(/nội dung do ai tạo/i)).toBeVisible();
    await expect(region.getByText(/đang tạo phản chiếu/i)).toBeVisible();

    // Finding 3 / re-review vòng cuối (final whole-branch review): assertion trước đó ("status
    // không rỗng") không phân biệt được hai đường khác nhau trong ReflectionCard.tsx — (1)
    // requestReflection() THẬT SỰ được gọi và callable thất bại (đường đang muốn chứng minh),
    // và (2) ai đó lỡ xoá lượt gọi requestReflection() khỏi component: getOutputForMoodLog()
    // vẫn chạy, không tìm thấy aiJournalOutputs nào (suite này không seed collection đó), và
    // component RƠI VÀO NHÁNH "vừa tạo xong mà đọc lại không thấy" — cũng ra phase="error" với
    // status không rỗng, khiến cả 4 assertion cũ vẫn xanh dù lượt gọi đã bị xoá.
    //
    // Hai nhánh đó tạo ra HAI CÂU CHỮ KHÁC NHAU — không phải đoán: đã verify trực tiếp bằng cách
    // chạy chính test này với một assertion cố tình sai để đọc text thật từ diff của Playwright.
    // Đường (1) — callable thật sự được gọi, thất bại vì provider trỏ tới cổng từ chối kết nối, xem
    // suite này (xem giới hạn ghi ở đầu file) — luôn đi qua nhánh "internal" của
    // mapReflectionErrorMessage() (src/lib/firestore/ai-outputs.ts), sinh đúng câu dưới đây.
    // Đường (2) — lượt gọi bị xoá — sẽ sinh câu "Không thể tải phản chiếu lúc này, thử lại sau
    // nhé." (nhánh !output ở ReflectionCard.tsx) thay vì câu chứa "tạo". Khẳng định đúng câu chữ
    // của đường (1) để xoá requestReflection() khỏi component thật sự làm test này đỏ.
    const status = region.getByRole("status");
    await expect(status).toBeVisible({ timeout: 15_000 });
    await expect(region.getByRole("button", { name: /hữu ích/i })).toHaveCount(0);
    await expect(status).toHaveText(
      "Không thể tạo phản chiếu lúc này, nhưng nhật ký cảm xúc của bạn đã được lưu an toàn. Thử lại sau nhé.",
    );
  });
});

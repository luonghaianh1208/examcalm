import { test, expect, type Page } from "@playwright/test";
import { verifyEmailViaEmulator } from "./support/auth-emulator";
import { seedChatEnabled, clearAiConfig } from "./support/seed-ai";
import { skipOnboarding } from "./support/skip-onboarding";

/**
 * E2E cho tính năng Trò chuyện (Spec #4, Task 10).
 *
 * task-10-brief.md chỉ ra tests/e2e/ai.spec.ts (Spec #3, Task 13) chỉ phủ đường AI-TẮT — kịch
 * bản "AI đã bật" ở đó chỉ chứng minh cổng consent/aiOptIn/aiPublic mở đúng, KHÔNG chứng minh
 * được tính năng THẬT SỰ hoạt động, vì Cloud Function generateReflection không có gì lắng nghe.
 * File này cố tình phủ CẢ HAI: (1) học sinh CHƯA bật AI không thấy ô chat, chỉ thấy chỉ dẫn bật,
 * VÀ (2) học sinh ĐÃ bật gõ được tin, thấy câu cảnh báo an toàn (§3.5 design spec) TRƯỚC KHI GÕ.
 *
 * GIỚI HẠN CỐ Ý — GIỐNG HỆT ai.spec.ts, đọc trước khi mở rộng file này: kịch bản "AI đã bật"
 * bên dưới lái toàn bộ luồng CLIENT thật — cổng aiOptIn/aiPublic.chatEnabled của ChatWindow, tạo
 * `chatSessions` thật (client ghi trực tiếp, được Rules cho phép), và một lượt gọi callable
 * `sendChatMessage` THẬT qua Functions Client SDK — nhưng KHÔNG có gì lắng nghe ở Functions
 * Emulator (cổng 5001) trong suite này, nên Cloud Function `sendChatMessage` KHÔNG chạy. Đây
 * không phải một khoảng trống bị bỏ sót:
 *
 *   1. `npm run test:e2e` (package.json) chỉ khởi động `--only auth,firestore` — không có
 *      `functions`. Thêm `functions` vào đó đòi hỏi `functions/lib` đã build VÀ
 *      `functions/node_modules` đã cài.
 *   2. Job "app" trong .github/workflows/ci.yml CỐ Ý KHÔNG BAO GIỜ chạy `npm ci --prefix
 *      functions` — đây là ranh giới kiến trúc có chủ đích (xem comment đầu job đó và đầu
 *      ai.spec.ts), để một lỗi kiểu "root tsconfig lỡ type-check cả functions/src" FAIL ngay ở
 *      CI thay vì chỉ lộ ra lúc deploy thật.
 *   3. task-10-brief.md không yêu cầu tái cấu trúc CI/tooling toàn repo chỉ để chạy được một
 *      lượt gọi callable thật qua Functions Emulator.
 *
 *   Vì vậy một E2E kéo dài tới tận Cloud Function `sendChatMessage` THẬT (bao gồm hai lớp phát
 *   hiện khủng hoảng, ghi crisisAlerts, gọi model...) KHÔNG khả thi trong khuôn khổ hiện tại của
 *   repo mà không đổi package.json/CI — nằm ngoài phạm vi Task 10. Cái mà kịch bản dưới đây THỰC
 *   SỰ chứng minh là toàn bộ đường dây client thật: cổng aiOptIn/aiPublic.chatEnabled mở đúng,
 *   câu cảnh báo an toàn hiện TRƯỚC khi gõ, gõ + gửi tạo một `chatSessions` document THẬT trên
 *   Firestore (không phải mock), và lượt gọi callable THẬT SỰ được kích hoạt (thất bại vì không
 *   có gì lắng nghe ở cổng 5001, KHÔNG PHẢI vì UI không gọi nó) rồi UI xử lý lỗi đó đúng cách
 *   (không crash, không hiện tin nhắn giả). Business logic BÊN TRONG sendChatMessage (hai lớp
 *   phát hiện khủng hoảng, quota riêng cho chat, ghi crisisAlerts...) đã được kiểm chứng đầy đủ,
 *   có Firestore emulator thật, ở functions/src/ai/sendChatMessage.test.ts — đó là tín hiệu
 *   "đầu-cuối không cần mạng thật" gần nhất hiện có cho riêng phần đó.
 */

function uniqueEmail(): string {
  return `hs-chat-${process.env.PW_RUN_ID ?? "local"}-${Math.floor(Math.random() * 1e9)}@example.com`;
}

const PASSWORD = "matkhau12345";

/** Giống signUp() ở tests/e2e/ai.spec.ts/student.spec.ts — mỗi file E2E trong repo này tự đủ,
 *  không import chéo giữa các spec file (xem comment đầu ai.spec.ts). */
async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/dang-ky");
  await expect(async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill(PASSWORD);
    await page.getByLabel("Biệt danh").fill("Mèo thử nghiệm Chat");
    await page.getByLabel("Trường").fill("THPT Thử Nghiệm");
    await page.getByRole("button", { name: /tạo tài khoản/i }).click();
    await expect(page).toHaveURL(/\/xac-thuc-email/, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}

/**
 * Xác thực email qua Auth Emulator rồi đợi tới khi session cookie thật sự phản ánh
 * `emailVerified: true` — CẦN cho `startChatSession()` (firestore.rules: `chatSessions` chỉ
 * `create` được khi `isVerified()`). Khác `verifyEmailAndWaitForCanSave` ở ai.spec.ts (không mở
 * MoodWidget — không liên quan gì tới chat), nhưng dùng CHUNG kỹ thuật đợi đúng request POST
 * `/api/session` thay vì `waitForLoadState("networkidle")` (xem lý do đầy đủ ở ai.spec.ts: app
 * này giữ kết nối Firestore realtime + HMR mở liên tục nên "network idle" có thể không bao giờ
 * xảy ra). Cũng tự bỏ qua WelcomeDialog/OnboardingTour (skipOnboarding) — modal focus-trap của
 * WelcomeDialog che kín màn hình, chặn mọi click ở các bước sau.
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

/**
 * Cùng lý do aiConsentSection() ở ai.spec.ts: trang /ho-so có một checkbox KHÁC không liên quan
 * ("Tham gia nghiên cứu") — phải scope vào đúng <section> chứa heading "Tính năng AI (không bắt
 * buộc)" (AiConsentSection.tsx — MỘT ô tick duy nhất mở cả phản chiếu lẫn chat, xem Task 9).
 */
function aiConsentSection(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: /tính năng ai/i }) });
}

function chatSection(page: Page) {
  return page.getByRole("region", { name: /trò chuyện cùng mèo/i });
}

test.describe("Chat — chưa bật AI (mặc định production lúc mới ship)", () => {
  test("học sinh chưa bật AI không thấy ô chat, chỉ thấy chỉ dẫn bật tính năng", async ({ page }) => {
    const email = uniqueEmail();
    // requireUser() (src/app/(student)/tro-chuyen/page.tsx) chỉ đòi ĐĂNG NHẬP, không đòi xác
    // thực email — không cần verifyEmail ở kịch bản này, cùng lý do trang /ho-so ở ai.spec.ts.
    await signUp(page, email);

    await page.goto("/tro-chuyen");
    const section = chatSection(page);
    await expect(section).toBeVisible();
    await expect(section.getByText(/bạn cần bật tính năng ai/i)).toBeVisible();
    await expect(section.getByRole("link", { name: /tới trang hồ sơ/i })).toBeVisible();

    // Im lặng tuyệt đối về phần còn lại của tính năng — không ô nhập bị vô hiệu hoá mời chào,
    // không câu cảnh báo an toàn nào (câu đó chỉ có ý nghĩa khi cổng đã mở), không nút Gửi.
    await expect(section.getByRole("textbox")).toHaveCount(0);
    await expect(section.getByRole("button", { name: /^gửi$/i })).toHaveCount(0);
    await expect(page.getByText(/lo cho sự an toàn của em/i)).toHaveCount(0);
  });
});

test.describe("Chat — đã bật AI (đường đi thuận)", () => {
  test.beforeAll(async () => {
    await seedChatEnabled("E2E Chat Test Provider");
  });

  test.afterAll(async () => {
    // Dọn lại về trạng thái trống — các spec file khác chạy sau trong cùng lượt `playwright
    // test` (vd guest.spec.ts, student.spec.ts, ai.spec.ts) không được kế thừa "chat đang bật".
    await clearAiConfig();
  });

  test("học sinh bật AI qua màn hình đồng ý thật, thấy câu cảnh báo an toàn TRƯỚC KHI GÕ, và gửi được tin nhắn qua UI thật", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    await verifyEmailAndWaitForSessionRefresh(page, email);

    // Bật đồng ý dùng AI qua màn hình thật — cổng đã mở (seedChatEnabled ở beforeAll: chatReady
    // true qua killSwitch.chat=false + chatQuotaPerDay=30) nên AiConsentSection hiện nút bật
    // thật, không phải trạng thái "chưa khả dụng". Scope vào đúng section (xem aiConsentSection).
    await page.goto("/ho-so");
    const consentSection = aiConsentSection(page);
    await expect(consentSection.getByText(/chưa khả dụng/i)).toHaveCount(0);
    const checkbox = consentSection.getByRole("checkbox");
    await expect(checkbox).not.toBeChecked();
    await checkbox.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("E2E Chat Test Provider");
    await dialog.getByRole("button", { name: /đồng ý, bật tính năng/i }).click();
    await expect(checkbox).toBeChecked();

    // Sang trang Trò chuyện — cổng ChatWindow tự đọc aiOptIn (vừa bật ở trên) + aiPublic.chatEnabled.
    await page.goto("/tro-chuyen");
    const section = chatSection(page);

    // §3.5 design spec, non-negotiable: câu cảnh báo an toàn PHẢI thấy được TRƯỚC tin nhắn đầu
    // tiên — khẳng định nó hiện ra NGAY, trước khi có bất kỳ tương tác gõ chữ nào ở dưới.
    await expect(section.getByText(/nội dung do ai tạo/i)).toBeVisible();
    await expect(
      section.getByText(/nếu em nói điều gì khiến chúng tôi lo cho sự an toàn của em/i),
    ).toBeVisible();

    // Ô nhập sẵn sàng (đợi qua trạng thái "Đang tải cuộc trò chuyện…" — listMySessions() đọc
    // Firestore thật, chưa có phiên nào nên rơi thẳng về initPhase="ready").
    const input = section.getByRole("textbox", { name: /nhập tin nhắn/i });
    await expect(input).toBeVisible({ timeout: 10_000 });

    const messageText = "Em đang hơi lo cho kỳ thi sắp tới.";
    await input.fill(messageText);
    await section.getByRole("button", { name: /^gửi$/i }).click();

    // Tin nhắn hiện NGAY (optimistic UI, ChatWindow.tsx::pendingText) — chứng minh thao tác
    // gõ+gửi qua UI thật sự hoạt động, KHÔNG phụ thuộc vào việc callable có thành công hay không.
    await expect(section.getByText(messageText)).toBeVisible();
    // "Đang trả lời…" chỉ hiện SAU khi startChatSession() (ghi chatSessions THẬT lên Firestore
    // emulator, không phải mock) đã thành công — tới đây nghĩa là bước ghi Firestore thật đã
    // xong, và sendMessage() đã bắt đầu gọi callable thật.
    await expect(section.getByText(/đang trả lời/i)).toBeVisible();

    // Callable sendChatMessage KHÔNG có gì lắng nghe (xem giới hạn ghi ở đầu file) — lượt gọi
    // thất bại, ChatWindow phải rơi vào trạng thái lỗi thay vì treo mãi hay hiện một tin trả lời
    // giả. Không đoán mò role cụ thể (quota/rate_limit dùng role="status", lỗi thật dùng
    // role="alert" — xem ChatWindow.tsx) vì một lỗi mạng thô không đi qua nhánh resource-exhausted
    // nào; khẳng định CÓ một thông điệp lỗi hiện ra và ô nhập nhận lại đúng nội dung vừa gõ (để
    // học sinh không mất công gõ lại — xem handleSend()).
    await expect(section.getByText(GENERIC_OR_MAPPED_ERROR_PATTERN)).toBeVisible({ timeout: 15_000 });
    await expect(input).toHaveValue(messageText);
  });
});

/** Bắt cả hai câu lỗi có thể xảy ra khi lượt gọi callable thất bại vì không có gì lắng nghe ở
 *  Functions Emulator (xem mapSendMessageErrorMessage, src/lib/firestore/chat.ts): nhánh mặc
 *  định "Không thể gửi tin nhắn lúc này..." (mã lỗi không khớp nhánh nào cụ thể) hoặc nhánh
 *  "internal" "Không thể trả lời lúc này...". KHÔNG cố định vào một trong hai vì hình dạng lỗi
 *  chính xác của Firebase Functions Client SDK khi không có gì lắng nghe ở cổng phụ thuộc phiên
 *  bản SDK — cả hai câu đều là bằng chứng hợp lệ cho đúng điều đang được chứng minh: UI xử lý
 *  lỗi gracefully, không treo, không hiện tin giả.
 */
const GENERIC_OR_MAPPED_ERROR_PATTERN = /không thể (gửi tin nhắn|trả lời) lúc này/i;

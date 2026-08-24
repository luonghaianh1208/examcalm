import { test, expect } from "@playwright/test";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { verifyEmailViaEmulator } from "./support/auth-emulator";

/**
 * TẠM THỜI — chỉ để xác minh thủ công payoff của Task 9 trên Emulator
 * (pairBeforeAfter chạy lần đầu với dữ liệu thật). KHÔNG commit file này.
 */

const MODULE_ID = "verify-task9-cbt";

test.beforeAll(async () => {
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GCLOUD_PROJECT ?? "examcalm-dev",
  });
  const db = getFirestore(app);
  await db.collection("cbtModules").doc(MODULE_ID).set({
    title: "Bài tập xác minh Task 9",
    version: 1,
    status: "published",
    isSampleContent: true,
    disclaimer: "Không thay thế chuyên gia.",
    intro: "Giới thiệu ngắn.",
    steps: [{ id: "s1", prompt: "Bạn đang nghĩ gì?", hint: "" }],
    closingText: "Cảm ơn bạn.",
    suggestedResourceSlugs: [],
    updatedBy: "verify-script",
    updatedAt: FieldValue.serverTimestamp(),
  });
});

function uniqueEmail(): string {
  return `verify-task9-${Math.floor(Math.random() * 1e9)}@example.com`;
}

const PASSWORD = "matkhau12345";

test("payoff Task 9: CBT session + cặp trước/sau xuất hiện trên /tien-trinh", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/dang-ky");
  await expect(async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill(PASSWORD);
    await page.getByLabel("Biệt danh").fill("Mèo xác minh");
    await page.getByLabel("Trường").fill("THPT Xác Minh");
    await page.getByRole("button", { name: /tạo tài khoản/i }).click();
    await expect(page).toHaveURL(/\/xac-thuc-email/, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });

  await verifyEmailViaEmulator(email);
  // VerifyEmailNotice chỉ phát hiện xác thực MỘT LẦN lúc mount (reload() lấy
  // trạng thái mới nhất từ Auth rồi establishSession() đổi lấy session cookie
  // mới qua POST /api/session) — phải đợi đúng request đó xong trước khi điều
  // hướng đi nơi khác, nếu không session cookie vẫn còn emailVerified cũ.
  const [sessionResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/session") && res.request().method() === "POST",
      { timeout: 15_000 },
    ),
    page.reload(),
  ]);
  expect(sessionResponse.ok()).toBe(true);

  await page.goto(`/cbt/${MODULE_ID}`);
  await expect(page.getByRole("heading", { name: /bài tập xác minh task 9/i })).toBeVisible();

  // Tính năng onboarding (Task 23, không liên quan Task 9) hiện welcome dialog
  // rồi tour hướng dẫn ngay sau lần xác thực email đầu tiên — đóng cả hai nếu
  // chúng xuất hiện, để không che nút thao tác của CBT bên dưới.
  const welcomeButton = page.getByRole("button", { name: /bắt đầu khám phá/i });
  try {
    await welcomeButton.waitFor({ state: "visible", timeout: 3_000 });
    await welcomeButton.click();
  } catch {
    // Không hiện thì thôi.
  }
  const tourSkip = page.getByRole("button", { name: /^bỏ qua$/i });
  try {
    await tourSkip.waitFor({ state: "visible", timeout: 3_000 });
    await tourSkip.click();
  } catch {
    // Không hiện thì thôi.
  }

  await page.getByRole("button", { name: /^bắt đầu$/i }).click();

  // Cảm xúc TRƯỚC: mặc định 5/10, giảm xuống 3/10.
  const beforeSlider = page.getByLabel("Điểm cảm xúc");
  await beforeSlider.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText("Điểm cảm xúc: 3/10")).toBeVisible();
  await page.getByRole("button", { name: /lưu và bắt đầu/i }).click();

  await page.getByLabel("Bạn đang nghĩ gì?").fill("Mình khắt khe quá");
  await page.getByRole("button", { name: /^tiếp tục$/i }).click();

  await page.getByRole("button", { name: /^hoàn thành$/i }).click();

  // Cảm xúc SAU: mặc định 5/10, tăng lên 6/10.
  const afterSlider = page.getByLabel("Điểm cảm xúc");
  await afterSlider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Điểm cảm xúc: 6/10")).toBeVisible();
  await page.getByRole("button", { name: /lưu và xem lời kết/i }).click();

  await expect(page.getByText(/cảm ơn bạn/i)).toBeVisible();

  // Kiểm tra thẳng dữ liệu đã ghi trong Firestore trước khi qua trang Tiến
  // trình — để phân biệt "ghi hỏng" với "đọc/hiển thị hỏng" nếu bước sau fail.
  const app2 = initializeApp(
    { credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT ?? "examcalm-dev" },
    "verify-check",
  );
  const db2 = getFirestore(app2);
  const sessionsSnap = await db2.collection("cbtSessions").get();
  console.log("---- cbtSessions docs ----");
  sessionsSnap.docs.forEach((d) => console.log(d.id, JSON.stringify(d.data())));
  const moodsSnap = await db2.collection("moodLogs").get();
  console.log("---- moodLogs docs ----");
  moodsSnap.docs.forEach((d) => console.log(d.id, JSON.stringify(d.data())));
  console.log("---------------------------");

  await page.goto("/tien-trinh");

  await expect(page.getByText(/mình khắt khe quá/i)).toBeVisible({ timeout: 15_000 });

  console.log("---- BODY TEXT /tien-trinh ----");
  console.log(await page.locator("main").innerText());
  console.log("--------------------------------");

  await expect(page.getByText(/3\/10.*6\/10/)).toBeVisible();
});

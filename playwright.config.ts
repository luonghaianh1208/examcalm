import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Next dev server (tiến trình con do webServer bên dưới khởi chạy) tự đọc
// .env.local, nhưng tiến trình Playwright test runner thì KHÔNG — các spec cần
// NEXT_PUBLIC_FIREBASE_PROJECT_ID/API_KEY để gọi thẳng REST API của Auth Emulator
// (xem tests/e2e/support/auth-emulator.ts). Ở CI không có .env.local — biến đã
// được workflow set sẵn qua `env:`, nên bỏ qua bước nạp file.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

// Hardcode — KHÔNG đọc từ env — để không có cách nào lỡ tay trỏ suite này vào
// một host khác ngoài Next dev server chạy local.
const LOCALHOST_BASE_URL = "http://127.0.0.1:3000";

/**
 * process.env sau khi loadEnvFile() có thể chứa `undefined` cho biến chưa set;
 * child_process không chấp nhận value kiểu đó.
 */
function stringEnv(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export default defineConfig({
  testDir: "./tests/e2e",
  // Chặn cứng: nếu ai chạy thẳng `playwright test` thay vì `npm run test:e2e`
  // (bọc trong `firebase emulators:exec`), dừng lại trước khi mở trình duyệt.
  globalSetup: "./tests/e2e/support/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: LOCALHOST_BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: LOCALHOST_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      ...stringEnv(),
      // Ép buộc dùng Emulator bất kể .env.local nói gì — lớp an toàn quan trọng
      // nhất: dev server phục vụ E2E không bao giờ được nói chuyện với Firebase thật.
      NEXT_PUBLIC_USE_EMULATOR: "true",
    },
  },
});

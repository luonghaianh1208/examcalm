/**
 * Chạy MỘT LẦN trước toàn bộ suite E2E (xem `globalSetup` trong playwright.config.ts).
 *
 * Chặn cứng khả năng suite này lỡ tay chạy nhắm vào Firebase THẬT:
 * - Nếu thiếu FIRESTORE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST, nghĩa là ai đó
 *   chạy thẳng `playwright test` thay vì `npm run test:e2e` (bọc trong
 *   `firebase emulators:exec`) — hai biến này chỉ được set khi Emulator thực sự
 *   đang chạy và lệnh được `emulators:exec` bơm env vào.
 * - Nếu NEXT_PUBLIC_FIREBASE_PROJECT_ID trỏ đúng project production ("examcalm",
 *   xem .firebaserc), dừng lại — dù đang có Emulator chạy, đây vẫn là dấu hiệu
 *   cấu hình sai chỗ nào đó.
 */
export default function globalSetup(): void {
  const firestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

  if (!firestoreEmulatorHost || !authEmulatorHost) {
    throw new Error(
      "Thiếu FIRESTORE_EMULATOR_HOST hoặc FIREBASE_AUTH_EMULATOR_HOST. " +
        "Chạy E2E qua `npm run test:e2e` (bọc trong `firebase emulators:exec`), " +
        "KHÔNG chạy thẳng `playwright test` — nếu không, code phía server có thể " +
        "vô tình nói chuyện với Firebase thật.",
    );
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (projectId === "examcalm") {
    throw new Error(
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID đang trỏ vào project production ("examcalm"). ' +
        "Dừng E2E để không lỡ tay ghi dữ liệu thật — kiểm tra lại .env.local hoặc biến CI.",
    );
  }
}

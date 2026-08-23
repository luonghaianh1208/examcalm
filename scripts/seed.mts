/**
 * Nạp dữ liệu MẪU (dev/demo) vào Firestore — 1 bài test tham khảo và vài tài
 * nguyên thư viện, để app không còn trống rỗng khi xem thử lần đầu.
 *
 * Mọi nội dung ở đây là GIẢ, CHƯA qua thẩm định chuyên môn (spec §1.1). Bài
 * test được đánh dấu isSampleContent = true — rule production ở Task 25 cấm
 * publish một bài test mang cờ này, nên script này chỉ dùng cho Emulator hoặc
 * project dev, không bao giờ chạy nhắm vào production.
 *
 * Idempotent: mọi document dùng id cố định và ghi bằng .set() (không addDoc),
 * nên chạy lại nhiều lần không tạo bản sao.
 *
 * Với Emulator:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=examcalm-dev \
 *   npx tsx scripts/seed.mts
 *
 * Với project dev thật:
 *   FIREBASE_SERVICE_ACCOUNT_JSON="$(cat serviceAccountKey.json)" \
 *   npx tsx scripts/seed.mts
 *
 * File .mts (không phải .ts) vì script dùng top-level await, và một script .ts
 * dưới setup CommonJS của project này không chạy được (xem scripts/bootstrap-admin.mts).
 *
 * Không có FIREBASE_SERVICE_ACCOUNT_JSON (ví dụ khi chạy thử với Emulator, có
 * FIRESTORE_EMULATOR_HOST) thì dùng Application Default Credentials — cùng
 * cách scripts/bootstrap-admin.mts và src/lib/firebase/admin.ts đã làm.
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { SAMPLE_TEST, SAMPLE_TEST_ID, SAMPLE_RESOURCES, SEED_ACTOR } from "./seed-data.mjs";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
initializeApp({
  credential: raw ? cert(JSON.parse(raw)) : applicationDefault(),
  projectId: process.env.GCLOUD_PROJECT ?? "examcalm-dev",
});

const db = getFirestore();

// Dev/Emulator: publish luôn để xem được ngay. Production dùng seed-prod.mts,
// nơi bài test bị ghi draft vì rule cấm publish nội dung mẫu.
await db.collection("testDefinitions").doc(SAMPLE_TEST_ID).set({
  ...SAMPLE_TEST,
  status: "published",
  updatedAt: FieldValue.serverTimestamp(),
});

for (const resource of SAMPLE_RESOURCES) {
  await db.collection("resources").doc(resource.slug).set({
    ...resource,
    status: "published",
    createdBy: SEED_ACTOR,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

console.log(`Đã nạp 1 bài test mẫu và ${SAMPLE_RESOURCES.length} tài nguyên mẫu.`);
console.log("Lưu ý: bài test có isSampleContent = true và sẽ hiển thị banner cảnh báo.");

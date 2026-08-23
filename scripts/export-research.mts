/**
 * Xuất dữ liệu ẩn danh cho phân tích KHKT (spec §11).
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON="$(cat serviceAccountKey.json)" \
 *   RESEARCH_SALT="<chuoi-bi-mat-luu-rieng>" \
 *   npx tsx scripts/export-research.mts > research-export.json
 *
 * QUY TẮC BẤT DI BẤT DỊCH:
 *   1. Chỉ lấy user có researchConsent.granted === true
 *   2. userId thay bằng hash có salt; salt KHÔNG lưu cùng file xuất
 *   3. TUYỆT ĐỐI không xuất moodLogs.note, nickname, school, email
 *
 * File .mts (không phải .ts) vì script dùng top-level await, và một script .ts
 * dưới setup CommonJS của project này không chạy được (xem scripts/bootstrap-admin.mts).
 *
 * Không có FIREBASE_SERVICE_ACCOUNT_JSON (ví dụ khi chạy thử với Emulator, có
 * FIRESTORE_EMULATOR_HOST) thì dùng Application Default Credentials — cùng
 * cách scripts/bootstrap-admin.mts và src/lib/firebase/admin.ts đã làm.
 */
import { createHash } from "node:crypto";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const salt = process.env.RESEARCH_SALT;
if (!salt) {
  console.error("Cần RESEARCH_SALT.");
  process.exit(1);
}

const credential = raw ? cert(JSON.parse(raw)) : applicationDefault();
initializeApp({ credential });
const db = getFirestore();

function anonymize(uid: string): string {
  return createHash("sha256").update(`${salt}:${uid}`).digest("hex").slice(0, 16);
}

const consented = await db.collection("users").where("researchConsent.granted", "==", true).get();
const consentedUids = consented.docs.map((d) => d.id);

const moodRows: unknown[] = [];
const testRows: unknown[] = [];

for (const uid of consentedUids) {
  const pid = anonymize(uid);

  const moods = await db.collection("moodLogs").where("userId", "==", uid).get();
  for (const d of moods.docs) {
    const data = d.data();
    // KHÔNG lấy data.note — đó là văn bản tự do có thể chứa thông tin nhận dạng.
    moodRows.push({
      participantId: pid,
      moodScore: data.moodScore,
      tags: data.tags ?? [],
      context: data.context,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    });
  }

  const attempts = await db.collection("testAttempts").where("userId", "==", uid).get();
  for (const d of attempts.docs) {
    const data = d.data();
    testRows.push({
      participantId: pid,
      testId: data.testId,
      testVersion: data.testVersion,
      score: data.score,
      level: data.level,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    });
  }
}

console.log(JSON.stringify({
  exportedAt: new Date().toISOString(),
  participantCount: consentedUids.length,
  moodLogs: moodRows,
  testAttempts: testRows,
}, null, 2));

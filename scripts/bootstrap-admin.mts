/**
 * Gán quyền admin ĐẦU TIÊN. Chạy MỘT LẦN, ở máy local.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON="$(cat serviceAccountKey.json)" \
 *   npx tsx scripts/bootstrap-admin.mts <email>
 *
 * Sau khi chạy xong, nên thu hồi service account key.
 *
 * Không có FIREBASE_SERVICE_ACCOUNT_JSON (ví dụ khi chạy thử với Emulator, có
 * FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST) thì dùng
 * Application Default Credentials — cùng cách `src/lib/firebase/admin.ts`
 * đã làm cho app Next.js.
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const email = process.argv[2];
if (!email) {
  console.error("Cách dùng: npx tsx scripts/bootstrap-admin.mts <email>");
  process.exit(1);
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const credential = raw ? cert(JSON.parse(raw)) : applicationDefault();

initializeApp({ credential });

const user = await getAuth().getUserByEmail(email);
await getAuth().setCustomUserClaims(user.uid, { ...user.customClaims, role: "admin" });
await getAuth().revokeRefreshTokens(user.uid);
await getFirestore().collection("users").doc(user.uid).set(
  { role: "admin", updatedAt: FieldValue.serverTimestamp() },
  { merge: true },
);

console.log(`Đã gán quyền admin cho ${email} (uid ${user.uid}).`);
console.log("Người dùng cần đăng xuất rồi đăng nhập lại để claim mới có hiệu lực.");

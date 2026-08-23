/**
 * Nạp dữ liệu mẫu vào project PRODUCTION.
 *
 * Khác `seed.mts` ở hai điểm quan trọng:
 *
 * 1. Dùng **client SDK đăng nhập bằng tài khoản admin**, không dùng Admin SDK.
 *    Máy triển khai không có service-account credential cho production, và tạo
 *    một cái chỉ để seed là mở rộng bề mặt tấn công không cần thiết. Đi qua
 *    client SDK nghĩa là mọi lệnh ghi đều bị Security Rules kiểm tra thật —
 *    đây là điểm cộng, không phải hạn chế: nếu rule chặn thứ gì, ta biết ngay.
 *
 * 2. Trạng thái bài test được SUY RA từ cờ `isSampleContent`, không hardcode.
 *    Rule production cấm publish bài test mang `isSampleContent: true`, nên
 *    script tuân đúng luật đó: nội dung mẫu -> draft, thang đo thật -> published.
 *    Nội dung tâm lý chưa qua thẩm định không được phục vụ học sinh thật.
 *
 * Chạy:
 *   EXAMCALM_ADMIN_EMAIL=... EXAMCALM_ADMIN_PASSWORD=... \
 *   EXAMCALM_API_KEY=... npx tsx scripts/seed-prod.mts
 *
 * Idempotent: mọi document dùng id cố định và ghi bằng setDoc(), chạy lại không
 * tạo bản sao.
 *
 * ## Nội dung bài test hiện tại
 *
 * Đang dùng GAD-7 — thang đo sàng lọc lo âu công khai, chuẩn, dùng rộng rãi.
 * Vì là thang đo thật chứ không phải câu hỏi tự nghĩ, `isSampleContent` là
 * false và script publish nó.
 *
 * Việc còn lại của con người: bản tiếng Việt trong `seed-data.mts` là bản
 * CHUYỂN NGỮ theo nội dung chuẩn, chưa được kiểm định tâm lý học tại Việt Nam.
 * Cần người có chuyên môn đọc lại và đối chiếu với một bản dịch đã công bố
 * trước khi dùng cho nghiên cứu hoặc mở rộng ngoài lớp học có giáo viên đi kèm.
 */
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { SAMPLE_TEST, SAMPLE_TEST_ID, SAMPLE_RESOURCES, SEED_ACTOR } from "./seed-data.mjs";

const apiKey = process.env.EXAMCALM_API_KEY;
const email = process.env.EXAMCALM_ADMIN_EMAIL;
const password = process.env.EXAMCALM_ADMIN_PASSWORD;

if (!apiKey || !email || !password) {
  console.error(
    "Thiếu biến môi trường. Cần EXAMCALM_API_KEY, EXAMCALM_ADMIN_EMAIL, EXAMCALM_ADMIN_PASSWORD.",
  );
  process.exit(1);
}

const app = initializeApp({
  apiKey,
  authDomain: "examcalm.firebaseapp.com",
  projectId: "examcalm",
  storageBucket: "examcalm.firebasestorage.app",
});

const cred = await signInWithEmailAndPassword(getAuth(app), email, password);
const token = await cred.user.getIdTokenResult();
if (token.claims.role !== "admin") {
  console.error(`Tài khoản ${email} không có quyền admin. Không seed được.`);
  process.exit(1);
}
console.log(`Đăng nhập thành công với quyền admin (uid ${cred.user.uid}).`);

const db = getFirestore(app);

// Trạng thái SUY RA từ cờ, không hardcode: script tuân đúng cùng một luật với
// rule production (cấm published + isSampleContent). Nếu ai đó đổi nội dung về
// dạng mẫu, script tự hạ xuống draft thay vì bị rule từ chối giữa chừng.
const testStatus = SAMPLE_TEST.isSampleContent ? "draft" : "published";
await setDoc(doc(db, "testDefinitions", SAMPLE_TEST_ID), {
  ...SAMPLE_TEST,
  status: testStatus,
  updatedBy: cred.user.uid,
  updatedAt: serverTimestamp(),
});
console.log(`Đã ghi bài test "${SAMPLE_TEST.title}" — trạng thái ${testStatus.toUpperCase()}.`);

for (const resource of SAMPLE_RESOURCES) {
  await setDoc(doc(db, "resources", resource.slug), {
    ...resource,
    status: "published",
    createdBy: SEED_ACTOR,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  console.log(`  + ${resource.slug} (${resource.visibility})`);
}

console.log(`\nĐã nạp ${SAMPLE_RESOURCES.length} tài nguyên thư viện (published).`);
if (testStatus === "draft") {
  console.log("Bài test là DRAFT — học sinh CHƯA thấy. Xem phần \"Mở bài test\" ở đầu file.");
} else {
  console.log("Bài test đã PUBLISHED — học sinh thấy được ngay.");
}
process.exit(0);

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
 * 2. Bài test được ghi ở trạng thái **draft**, không phải published. Rule
 *    production cấm publish bài test mang `isSampleContent: true`. Đó là chủ ý:
 *    nội dung tâm lý chưa qua thẩm định chuyên môn không được phục vụ học sinh
 *    thật. Muốn mở bài test cho học sinh, xem phần "Mở bài test" bên dưới.
 *
 * Chạy:
 *   EXAMCALM_ADMIN_EMAIL=... EXAMCALM_ADMIN_PASSWORD=... \
 *   EXAMCALM_API_KEY=... npx tsx scripts/seed-prod.mts
 *
 * Idempotent: mọi document dùng id cố định và ghi bằng setDoc(), chạy lại không
 * tạo bản sao.
 *
 * ## Mở bài test cho học sinh
 *
 * Có đúng hai cách hợp lệ, và cả hai đều là quyết định của con người:
 *
 *   a) Thay nội dung mẫu bằng thang đo đã được chuyên gia tâm lý thẩm định,
 *      đặt `isSampleContent: false`, rồi publish qua Admin console. Đây là
 *      đường đúng.
 *   b) Nới rule production để cho phép publish nội dung mẫu. Chỉ nên làm khi
 *      chấp nhận rằng học sinh sẽ làm một bài test chưa được thẩm định — giao
 *      diện vẫn hiện banner cảnh báo, nhưng banner không thay được thẩm định.
 *
 * Script này KHÔNG tự chọn giúp. Nó ghi draft và dừng lại.
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

// Bài test: ghi DRAFT. Rule production chặn published + isSampleContent.
await setDoc(doc(db, "testDefinitions", SAMPLE_TEST_ID), {
  ...SAMPLE_TEST,
  status: "draft",
  updatedBy: cred.user.uid,
  updatedAt: serverTimestamp(),
});
console.log(`Đã ghi bài test "${SAMPLE_TEST.title}" ở trạng thái DRAFT.`);

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
console.log("Bài test vẫn là DRAFT — học sinh CHƯA thấy. Xem phần \"Mở bài test\" ở đầu file.");
process.exit(0);

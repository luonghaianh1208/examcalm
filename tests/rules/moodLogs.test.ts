import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { createTestEnv, authedDb, adminDb, guestDb, seed } from "./helpers";

let env: RulesTestEnvironment;

const LOG = {
  userId: "u1",
  moodScore: 6,
  moodIcon: "calm",
  note: "Hôm nay ôn được 2 chương",
  tags: ["on-thi"],
  context: "standalone",
  linkedActivityRef: null,
  imageUrl: null,
  createdAt: new Date(),
};

beforeAll(async () => { env = await createTestEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("moodLogs/{id}", () => {
  it("student đã verify tạo được nhật ký của mình", async () => {
    await assertSucceeds(setDoc(doc(authedDb(env, "u1"), "moodLogs/m1"), LOG));
  });

  it("student CHƯA verify KHÔNG tạo được", async () => {
    const db = authedDb(env, "u1", { email_verified: false });
    await assertFails(setDoc(doc(db, "moodLogs/m1"), LOG));
  });

  it("Guest KHÔNG tạo được nhật ký", async () => {
    await assertFails(setDoc(doc(guestDb(env), "moodLogs/m1"), LOG));
  });

  it("KHÔNG tạo được nhật ký mang userId của người khác", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u2"), "moodLogs/m1"), LOG));
  });

  it("chủ sở hữu đọc, sửa, xóa được nhật ký của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "moodLogs/m1"), LOG); });
    const db = authedDb(env, "u1");
    await assertSucceeds(getDoc(doc(db, "moodLogs/m1")));
    await assertSucceeds(updateDoc(doc(db, "moodLogs/m1"), { note: "sửa lại" }));
    await assertSucceeds(deleteDoc(doc(db, "moodLogs/m1")));
  });

  it("user khác KHÔNG đọc được nhật ký", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "moodLogs/m1"), LOG); });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "moodLogs/m1")));
  });

  it("user khác KHÔNG sửa, KHÔNG xóa được nhật ký không phải của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "moodLogs/m1"), LOG); });
    const db = authedDb(env, "u2");
    await assertFails(updateDoc(doc(db, "moodLogs/m1"), { note: "sửa trộm" }));
    await assertFails(deleteDoc(doc(db, "moodLogs/m1")));
  });

  it("chủ sở hữu KHÔNG đổi được userId của nhật ký để cấy vào nhật ký người khác (C1)", async () => {
    // Kịch bản tấn công: u2 tự tạo doc bằng chính uid của mình (được phép), rồi
    // update lại userId thành uid nạn nhân — nếu lọt, doc sẽ "thuộc về" nạn nhân
    // và xuất hiện trong nhật ký của họ dù họ không hề viết ra nội dung đó.
    await seed(env, async (db) => {
      await setDoc(doc(db, "moodLogs/m1"), { ...LOG, userId: "u2" });
    });
    const db = authedDb(env, "u2");
    await assertFails(
      updateDoc(doc(db, "moodLogs/m1"), { userId: "u1", note: "nội dung cấy vào" }),
    );
  });

  it("ADMIN CŨNG KHÔNG đọc được nhật ký cảm xúc của học sinh", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "moodLogs/m1"), LOG); });
    await assertFails(getDoc(doc(adminDb(env), "moodLogs/m1")));
  });

  it("ADMIN CŨNG KHÔNG sửa, KHÔNG xóa được nhật ký cảm xúc của học sinh", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "moodLogs/m1"), LOG); });
    const db = adminDb(env);
    await assertFails(updateDoc(doc(db, "moodLogs/m1"), { note: "admin sửa" }));
    await assertFails(deleteDoc(doc(db, "moodLogs/m1")));
  });
});

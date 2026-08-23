import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { createTestEnv, authedDb, adminDb, guestDb, seed } from "./helpers";

let env: RulesTestEnvironment;

const ATTEMPT = {
  userId: "u1",
  testId: "t1",
  testVersion: 1,
  score: 5,
  level: "nhe",
  createdAt: new Date(),
};

const ANSWERS = {
  userId: "u1",
  answers: { q1: 2, q2: 3 },
};

beforeAll(async () => { env = await createTestEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("testAttempts/{id}", () => {
  it("student đã verify email tạo được lượt làm bài của mình", async () => {
    await assertSucceeds(setDoc(doc(authedDb(env, "u1"), "testAttempts/a1"), ATTEMPT));
  });

  it("student CHƯA verify email KHÔNG tạo được", async () => {
    const db = authedDb(env, "u1", { email_verified: false });
    await assertFails(setDoc(doc(db, "testAttempts/a1"), ATTEMPT));
  });

  it("KHÔNG tạo được lượt làm bài mang userId của người khác", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u2"), "testAttempts/a1"), ATTEMPT));
  });

  it("Guest KHÔNG tạo được lượt làm bài", async () => {
    await assertFails(setDoc(doc(guestDb(env), "testAttempts/a1"), ATTEMPT));
  });

  it("chủ sở hữu đọc được lượt làm bài của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAttempts/a1"), ATTEMPT); });
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "testAttempts/a1")));
  });

  it("user khác KHÔNG đọc được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAttempts/a1"), ATTEMPT); });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "testAttempts/a1")));
  });

  it("Guest KHÔNG đọc được lượt làm bài", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAttempts/a1"), ATTEMPT); });
    await assertFails(getDoc(doc(guestDb(env), "testAttempts/a1")));
  });

  it("admin đọc được điểm/mức độ (testAttempts) — để phát hiện học sinh cần hỗ trợ, KHÔNG kèm đáp án", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAttempts/a1"), ATTEMPT); });
    await assertSucceeds(getDoc(doc(adminDb(env), "testAttempts/a1")));
  });

  it("KHÔNG sửa được sau khi submit — kể cả chủ sở hữu", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAttempts/a1"), ATTEMPT); });
    await assertFails(updateDoc(doc(authedDb(env, "u1"), "testAttempts/a1"), { score: 99 }));
  });

  it("chủ sở hữu xóa được lượt làm bài của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAttempts/a1"), ATTEMPT); });
    await assertSucceeds(deleteDoc(doc(authedDb(env, "u1"), "testAttempts/a1")));
  });

  it("user khác KHÔNG xóa được lượt làm bài không phải của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAttempts/a1"), ATTEMPT); });
    await assertFails(deleteDoc(doc(authedDb(env, "u2"), "testAttempts/a1")));
  });
});

// Đây là điểm mấu chốt của thay đổi: admin thấy được điểm/mức độ (khối trên)
// nhưng TUYỆT ĐỐI không thấy đáp án từng câu — đó là lý do đáp án phải nằm ở
// một document riêng thay vì một field trong testAttempts (Rules không kiểm
// soát được theo field).
describe("testAnswers/{id}", () => {
  it("student đã verify email tạo được đáp án của mình", async () => {
    await assertSucceeds(setDoc(doc(authedDb(env, "u1"), "testAnswers/a1"), ANSWERS));
  });

  it("student CHƯA verify email KHÔNG tạo được", async () => {
    const db = authedDb(env, "u1", { email_verified: false });
    await assertFails(setDoc(doc(db, "testAnswers/a1"), ANSWERS));
  });

  it("KHÔNG tạo được đáp án mang userId của người khác", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u2"), "testAnswers/a1"), ANSWERS));
  });

  it("Guest KHÔNG tạo được đáp án", async () => {
    await assertFails(setDoc(doc(guestDb(env), "testAnswers/a1"), ANSWERS));
  });

  it("chủ sở hữu đọc được đáp án của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAnswers/a1"), ANSWERS); });
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "testAnswers/a1")));
  });

  it("admin KHÔNG đọc được đáp án từng câu của học sinh", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAnswers/a1"), ANSWERS); });
    await assertFails(getDoc(doc(adminDb(env), "testAnswers/a1")));
  });

  it("user khác KHÔNG đọc được đáp án", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAnswers/a1"), ANSWERS); });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "testAnswers/a1")));
  });

  it("Guest KHÔNG đọc được đáp án", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAnswers/a1"), ANSWERS); });
    await assertFails(getDoc(doc(guestDb(env), "testAnswers/a1")));
  });

  it("KHÔNG sửa được sau khi tạo — kể cả chủ sở hữu", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAnswers/a1"), ANSWERS); });
    await assertFails(updateDoc(doc(authedDb(env, "u1"), "testAnswers/a1"), { answers: { q1: 0 } }));
  });

  it("chủ sở hữu xóa được đáp án của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAnswers/a1"), ANSWERS); });
    await assertSucceeds(deleteDoc(doc(authedDb(env, "u1"), "testAnswers/a1")));
  });

  it("user khác KHÔNG xóa được đáp án không phải của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAnswers/a1"), ANSWERS); });
    await assertFails(deleteDoc(doc(authedDb(env, "u2"), "testAnswers/a1")));
  });
});

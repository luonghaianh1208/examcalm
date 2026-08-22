import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { createTestEnv, authedDb, adminDb, guestDb, seed } from "./helpers";

let env: RulesTestEnvironment;

const ATTEMPT = {
  userId: "u1",
  testId: "t1",
  testVersion: 1,
  answers: { q1: 2, q2: 3 },
  score: 5,
  level: "nhe",
  createdAt: new Date(),
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

  it("admin đọc được", async () => {
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

import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { createTestEnv, authedDb, adminDb, guestDb, seed } from "./helpers";

let env: RulesTestEnvironment;

const PROFILE = {
  uid: "u1",
  role: "student",
  nickname: "Mèo con",
  gradeLevel: "12",
  school: "THPT Trần Phú",
  examGoals: ["Khối A"],
  privacySettings: { aiOptIn: false, shareImageWithAI: false },
  researchConsent: null,
  deletionRequestedAt: null,
};

beforeAll(async () => { env = await createTestEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("users/{uid}", () => {
  it("chủ sở hữu tạo được hồ sơ của chính mình với role student", async () => {
    const db = authedDb(env, "u1");
    await assertSucceeds(setDoc(doc(db, "users/u1"), PROFILE));
  });

  it("KHÔNG tạo được hồ sơ với role admin", async () => {
    const db = authedDb(env, "u1");
    await assertFails(setDoc(doc(db, "users/u1"), { ...PROFILE, role: "admin" }));
  });

  it("KHÔNG tạo được hồ sơ cho uid người khác", async () => {
    const db = authedDb(env, "u1");
    await assertFails(setDoc(doc(db, "users/u2"), { ...PROFILE, uid: "u2" }));
  });

  it("chủ sở hữu đọc được hồ sơ của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "users/u1")));
  });

  it("user KHÔNG đọc được hồ sơ người khác", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "users/u1")));
  });

  it("admin đọc được hồ sơ bất kỳ", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertSucceeds(getDoc(doc(adminDb(env), "users/u1")));
  });

  it("Guest KHÔNG đọc được hồ sơ nào", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertFails(getDoc(doc(guestDb(env), "users/u1")));
  });

  it("chủ sở hữu sửa được nickname của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertSucceeds(updateDoc(doc(authedDb(env, "u1"), "users/u1"), { nickname: "Mèo lớn" }));
  });

  it("chủ sở hữu KHÔNG tự nâng mình lên admin", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertFails(updateDoc(doc(authedDb(env, "u1"), "users/u1"), { role: "admin" }));
  });

  it("chủ sở hữu tự cấp được researchConsent", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertSucceeds(
      updateDoc(doc(authedDb(env, "u1"), "users/u1"), {
        researchConsent: { granted: true, grantedAt: new Date(), version: "v1" },
      }),
    );
  });

  it("admin sửa được hồ sơ người khác", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertSucceeds(updateDoc(doc(adminDb(env), "users/u1"), { nickname: "Mèo lớn" }));
  });

  it("admin nâng được role của người khác", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertSucceeds(updateDoc(doc(adminDb(env), "users/u1"), { role: "admin" }));
  });

  it("KHÔNG ai xóa được doc users trực tiếp (phải qua Cloud Function)", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertFails(deleteDoc(doc(authedDb(env, "u1"), "users/u1")));
    await assertFails(deleteDoc(doc(adminDb(env), "users/u1")));
  });
});

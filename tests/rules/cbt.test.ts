import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createTestEnv, authedDb, adminDb, guestDb, seed } from "./helpers";

let env: RulesTestEnvironment;

const SESSION = {
  userId: "u1", moduleId: "m1", moduleVersion: 1,
  answers: { s1: "Mình sợ trượt." }, summary: "",
};

const MODULE_PUBLISHED = { title: "Bài mẫu", version: 1, status: "published", isSampleContent: true };
const MODULE_DRAFT = { title: "Bài nháp", version: 1, status: "draft", isSampleContent: true };

beforeAll(async () => { env = await createTestEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("cbtModules", () => {
  it("Guest đọc được module đã publish", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "cbtModules/m1"), MODULE_PUBLISHED); });
    await assertSucceeds(getDoc(doc(guestDb(env), "cbtModules/m1")));
  });

  it("Guest KHÔNG đọc được module draft", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "cbtModules/m2"), MODULE_DRAFT); });
    await assertFails(getDoc(doc(guestDb(env), "cbtModules/m2")));
  });

  it("Admin đọc được module draft", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "cbtModules/m2"), MODULE_DRAFT); });
    await assertSucceeds(getDoc(doc(adminDb(env), "cbtModules/m2")));
  });

  it("Admin ghi được module", async () => {
    await assertSucceeds(setDoc(doc(adminDb(env), "cbtModules/m3"), MODULE_DRAFT));
  });

  it("Student KHÔNG ghi được module", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "cbtModules/m3"), MODULE_DRAFT));
  });

  // --- Audit bổ sung (ngoài brief) ---

  it("Guest KHÔNG ghi được module", async () => {
    await assertFails(setDoc(doc(guestDb(env), "cbtModules/m3"), MODULE_DRAFT));
  });

  it("Student (không phải admin) KHÔNG đọc được module draft", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "cbtModules/m2"), MODULE_DRAFT); });
    await assertFails(getDoc(doc(authedDb(env, "u1"), "cbtModules/m2")));
  });
});

describe("cbtSessions", () => {
  it("Student tạo được session của chính mình", async () => {
    await assertSucceeds(setDoc(doc(authedDb(env, "u1"), "cbtSessions/s1"), SESSION));
  });

  it("Student KHÔNG tạo được session mang userId người khác", async () => {
    await assertFails(
      setDoc(doc(authedDb(env, "u1"), "cbtSessions/s1"), { ...SESSION, userId: "u2" }),
    );
  });

  it("Guest KHÔNG tạo được session", async () => {
    await assertFails(setDoc(doc(guestDb(env), "cbtSessions/s1"), SESSION));
  });

  it("Student đọc được session của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "cbtSessions/s1"), SESSION); });
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "cbtSessions/s1")));
  });

  it("Student KHÔNG đọc được session người khác", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "cbtSessions/s1"), SESSION); });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "cbtSessions/s1")));
  });

  it("ADMIN KHÔNG đọc được session — riêng tư như moodLogs", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "cbtSessions/s1"), SESSION); });
    await assertFails(getDoc(doc(adminDb(env), "cbtSessions/s1")));
  });

  it("KHÔNG sửa được session sau khi ghi", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "cbtSessions/s1"), SESSION); });
    await assertFails(updateDoc(doc(authedDb(env, "u1"), "cbtSessions/s1"), { summary: "x" }));
  });

  it("Student xóa được session của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "cbtSessions/s1"), SESSION); });
    await assertSucceeds(deleteDoc(doc(authedDb(env, "u1"), "cbtSessions/s1")));
  });

  it("Student KHÔNG xóa được session người khác", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "cbtSessions/s1"), SESSION); });
    await assertFails(deleteDoc(doc(authedDb(env, "u2"), "cbtSessions/s1")));
  });

  // --- Audit bổ sung (ngoài brief) ---

  it("Guest KHÔNG đọc được session", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "cbtSessions/s1"), SESSION); });
    await assertFails(getDoc(doc(guestDb(env), "cbtSessions/s1")));
  });

  it("Guest KHÔNG xóa được session", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "cbtSessions/s1"), SESSION); });
    await assertFails(deleteDoc(doc(guestDb(env), "cbtSessions/s1")));
  });

  it("ADMIN KHÔNG sửa, KHÔNG xóa được session — riêng tư như moodLogs", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "cbtSessions/s1"), SESSION); });
    const db = adminDb(env);
    await assertFails(updateDoc(doc(db, "cbtSessions/s1"), { summary: "admin sửa" }));
    await assertFails(deleteDoc(doc(db, "cbtSessions/s1")));
  });

  it("student CHƯA verify email KHÔNG tạo được session", async () => {
    const db = authedDb(env, "u1", { email_verified: false });
    await assertFails(setDoc(doc(db, "cbtSessions/s1"), SESSION));
  });

  // Kịch bản tấn công như C1 của moodLogs: rule cho phép update ở đây là
  // `if false` tuyệt đối, nên ngay cả chủ sở hữu cũng không thể "cấy" nội
  // dung vào session của người khác bằng cách đổi lại userId sau khi tạo.
  it("chủ sở hữu KHÔNG đổi được userId của session để cấy vào session người khác (C1)", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "cbtSessions/s1"), { ...SESSION, userId: "u2" });
    });
    const db = authedDb(env, "u2");
    await assertFails(
      updateDoc(doc(db, "cbtSessions/s1"), { userId: "u1", summary: "nội dung cấy vào" }),
    );
  });
});

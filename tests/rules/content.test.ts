import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { createTestEnv, authedDb, adminDb, guestDb, seed } from "./helpers";

let env: RulesTestEnvironment;

const PUBLIC_RES = {
  title: "Kỹ thuật thở 4-7-8",
  slug: "ky-thuat-tho-4-7-8",
  type: "guide", category: "thu-gian", tags: ["tho"],
  content: "# Hít vào 4 nhịp", videoUrl: null,
  status: "published", visibility: "public",
  createdBy: "admin-1", createdAt: new Date(), updatedAt: new Date(),
};
const DRAFT_RES = { ...PUBLIC_RES, slug: "nhap", status: "draft" };
const STUDENT_RES = { ...PUBLIC_RES, slug: "chi-hoc-sinh", visibility: "student_only" };

const PUBLISHED_TEST = {
  title: "Test lo âu (mẫu)", version: 1, status: "published", isSampleContent: true,
  questions: [], scoring: { thresholds: [] },
  disclaimer: "Không phải chẩn đoán y khoa.",
  updatedBy: "admin-1", updatedAt: new Date(),
};

beforeAll(async () => { env = await createTestEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("resources/{id}", () => {
  it("Guest đọc được resource public đã publish", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "resources/r1"), PUBLIC_RES); });
    await assertSucceeds(getDoc(doc(guestDb(env), "resources/r1")));
  });

  it("Guest KHÔNG đọc được resource draft", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "resources/r2"), DRAFT_RES); });
    await assertFails(getDoc(doc(guestDb(env), "resources/r2")));
  });

  it("Guest KHÔNG đọc được resource student_only", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "resources/r3"), STUDENT_RES); });
    await assertFails(getDoc(doc(guestDb(env), "resources/r3")));
  });

  it("Student đọc được resource student_only đã publish", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "resources/r3"), STUDENT_RES); });
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "resources/r3")));
  });

  it("Student KHÔNG ghi được resource", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "resources/r9"), PUBLIC_RES));
  });

  it("Admin ghi được resource", async () => {
    await assertSucceeds(setDoc(doc(adminDb(env), "resources/r9"), PUBLIC_RES));
  });

  // --- Audit bổ sung (ngoài brief) ---

  it("Guest KHÔNG ghi được resource", async () => {
    await assertFails(setDoc(doc(guestDb(env), "resources/r9"), PUBLIC_RES));
  });

  it("Admin đọc được resource draft", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "resources/r2"), DRAFT_RES); });
    await assertSucceeds(getDoc(doc(adminDb(env), "resources/r2")));
  });

  it("Student KHÔNG đọc được resource draft", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "resources/r2"), DRAFT_RES); });
    await assertFails(getDoc(doc(authedDb(env, "u1"), "resources/r2")));
  });
});

describe("testDefinitions/{id}", () => {
  it("Guest đọc được test đã publish", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testDefinitions/t1"), PUBLISHED_TEST); });
    await assertSucceeds(getDoc(doc(guestDb(env), "testDefinitions/t1")));
  });

  it("Guest KHÔNG đọc được test draft", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "testDefinitions/t2"), { ...PUBLISHED_TEST, status: "draft" });
    });
    await assertFails(getDoc(doc(guestDb(env), "testDefinitions/t2")));
  });

  it("Admin đọc được test draft", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "testDefinitions/t2"), { ...PUBLISHED_TEST, status: "draft" });
    });
    await assertSucceeds(getDoc(doc(adminDb(env), "testDefinitions/t2")));
  });

  it("Student KHÔNG ghi được testDefinition", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "testDefinitions/t9"), PUBLISHED_TEST));
  });

  // --- Audit bổ sung (ngoài brief) ---

  it("Admin ghi được testDefinition", async () => {
    await assertSucceeds(setDoc(doc(adminDb(env), "testDefinitions/t9"), PUBLISHED_TEST));
  });

  it("Guest KHÔNG ghi được testDefinition", async () => {
    await assertFails(setDoc(doc(guestDb(env), "testDefinitions/t9"), PUBLISHED_TEST));
  });
});

describe("users/{uid}/favorites/{resourceId}", () => {
  const FAV = { resourceId: "r1", savedAt: new Date(), usedAt: null };

  it("chủ sở hữu lưu được yêu thích", async () => {
    await assertSucceeds(setDoc(doc(authedDb(env, "u1"), "users/u1/favorites/r1"), FAV));
  });

  it("user khác KHÔNG đọc được yêu thích của mình người ta", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1/favorites/r1"), FAV); });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "users/u1/favorites/r1")));
  });

  // --- Audit bổ sung (ngoài brief) ---

  it("chủ sở hữu đọc được yêu thích của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1/favorites/r1"), FAV); });
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "users/u1/favorites/r1")));
  });

  it("user khác KHÔNG ghi được yêu thích của người khác", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u2"), "users/u1/favorites/r1"), FAV));
  });

  it("Guest KHÔNG đọc được yêu thích", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1/favorites/r1"), FAV); });
    await assertFails(getDoc(doc(guestDb(env), "users/u1/favorites/r1")));
  });

  it("Guest KHÔNG ghi được yêu thích", async () => {
    await assertFails(setDoc(doc(guestDb(env), "users/u1/favorites/r1"), FAV));
  });
});

describe("auditLogs/{id}", () => {
  const LOG = {
    actorUid: "admin-1", action: "setUserRole", targetType: "user",
    targetId: "u1", before: null, after: { role: "admin" }, timestamp: new Date(),
  };

  it("Admin đọc được audit log", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "auditLogs/l1"), LOG); });
    await assertSucceeds(getDoc(doc(adminDb(env), "auditLogs/l1")));
  });

  it("Student KHÔNG đọc được audit log", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "auditLogs/l1"), LOG); });
    await assertFails(getDoc(doc(authedDb(env, "u1"), "auditLogs/l1")));
  });

  it("KHÔNG ai ghi được audit log trực tiếp — kể cả admin", async () => {
    await assertFails(setDoc(doc(adminDb(env), "auditLogs/l2"), LOG));
  });

  // --- Audit bổ sung (ngoài brief) ---

  it("Guest KHÔNG đọc được audit log", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "auditLogs/l1"), LOG); });
    await assertFails(getDoc(doc(guestDb(env), "auditLogs/l1")));
  });

  it("Student KHÔNG ghi được audit log trực tiếp", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "auditLogs/l3"), LOG));
  });

  it("Guest KHÔNG ghi được audit log trực tiếp", async () => {
    await assertFails(setDoc(doc(guestDb(env), "auditLogs/l3"), LOG));
  });
});

describe("catch-all deny", () => {
  /*
   * Trước đây test này dùng `confessions` làm ví dụ collection chưa khai báo.
   * Khi Confession được xây thật, nó trở thành collection ĐÃ khai báo và test
   * đỏ — đúng như mong đợi.
   *
   * Tên mới cố ý là một chuỗi không bao giờ trở thành tính năng, để lần sau
   * không lặp lại đúng chuyện này. Cái đang kiểm là luật catch-all, không phải
   * một collection cụ thể nào.
   */
  const KHONG_BAO_GIO_TON_TAI = "khongPhaiCollectionThat";

  it("collection chưa khai báo bị chặn hoàn toàn", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, `${KHONG_BAO_GIO_TON_TAI}/c1`), { text: "x" });
    });
    await assertFails(getDoc(doc(adminDb(env), `${KHONG_BAO_GIO_TON_TAI}/c1`)));
    await assertFails(setDoc(doc(adminDb(env), `${KHONG_BAO_GIO_TON_TAI}/c2`), { text: "y" }));
    await assertFails(deleteDoc(doc(adminDb(env), `${KHONG_BAO_GIO_TON_TAI}/c1`)));
  });
});

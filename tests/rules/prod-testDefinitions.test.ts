import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { createTestEnv, adminDb } from "./helpers";

// Kiểm tra riêng cho firestore.prod.rules: rule testDefinitions siết chặt hơn
// bản thường (firestore.rules) — chặn publish nội dung mẫu chưa thẩm định (rủi ro R5).
// Dùng projectId riêng để không lẫn với các test khác chạy trên firestore.rules.
let env: RulesTestEnvironment;

const PUBLISHED_SAMPLE_TEST = {
  title: "Test lo âu (mẫu)", version: 1, status: "published", isSampleContent: true,
  questions: [], scoring: { thresholds: [] },
  disclaimer: "Không phải chẩn đoán y khoa.",
  updatedBy: "admin-1", updatedAt: new Date(),
};

const PUBLISHED_REAL_TEST = {
  ...PUBLISHED_SAMPLE_TEST, isSampleContent: false,
};

const DRAFT_SAMPLE_TEST = { ...PUBLISHED_SAMPLE_TEST, status: "draft" };

beforeAll(async () => {
  env = await createTestEnv("firestore.prod.rules", "examcalm-rules-test-prod");
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("firestore.prod.rules — testDefinitions/{id}", () => {
  it("Admin KHÔNG publish được nội dung mẫu (isSampleContent: true)", async () => {
    await assertFails(
      setDoc(doc(adminDb(env), "testDefinitions/t1"), PUBLISHED_SAMPLE_TEST),
    );
  });

  it("Admin publish được nội dung KHÔNG phải mẫu (isSampleContent: false)", async () => {
    await assertSucceeds(
      setDoc(doc(adminDb(env), "testDefinitions/t2"), PUBLISHED_REAL_TEST),
    );
  });

  it("Admin vẫn lưu được nội dung mẫu ở trạng thái draft (chưa publish)", async () => {
    await assertSucceeds(
      setDoc(doc(adminDb(env), "testDefinitions/t3"), DRAFT_SAMPLE_TEST),
    );
  });
});

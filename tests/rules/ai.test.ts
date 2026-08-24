import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { createTestEnv, authedDb, adminDb, guestDb, seed } from "./helpers";

let env: RulesTestEnvironment;

// Khớp field-by-field với aiJournalOutputSchema (src/lib/types/ai.ts:69-81) —
// fixture sai khớp schema là chính lý do lỗ hổng round 1 (chỉ pin 2/11 field)
// không bị test bắt được.
const AI_OUTPUT = {
  userId: "u1",
  moodLogId: "m1",
  reflectionText: "Bạn đã rất cố gắng hôm nay.",
  catStoryText: "Chú mèo nhỏ đã vượt qua một ngày dài.",
  journalPrompt: "Hôm nay điều gì khiến bạn thấy nhẹ nhõm hơn?",
  promptTemplateId: "pt1",
  promptVersion: 1,
  providerLabel: "OpenAI",
  model: "gpt-4o-mini",
  userFeedback: null,
  createdAt: new Date(),
};

const USAGE = { userId: "u1", period: "2026-08", count: 3, updatedAt: new Date() };

const AI_CONFIG = { baseUrl: "https://api.example.com", quota: 1000, rateLimitPerMin: 10 };
const AI_PUBLIC = { providerName: "OpenAI" };

const PROMPT_TEMPLATE = { id: "pt1", text: "Hãy phản chiếu suy nghĩ sau...", version: 1 };

const SAFETY_LOG = {
  triggeredKeyword: "trầm cảm",
  model: "gpt-4o-mini",
  promptTemplateId: "pt1",
  createdAt: new Date(),
};

beforeAll(async () => { env = await createTestEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("aiJournalOutputs/{id}", () => {
  it("chủ sở hữu đọc được output của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiJournalOutputs/o1"), AI_OUTPUT); });
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "aiJournalOutputs/o1")));
  });

  it("người khác KHÔNG đọc được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiJournalOutputs/o1"), AI_OUTPUT); });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "aiJournalOutputs/o1")));
  });

  it("ADMIN CŨNG KHÔNG đọc được — đây là phản chiếu về ghi chú riêng tư, giống lý do admin không đọc được moodLogs", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiJournalOutputs/o1"), AI_OUTPUT); });
    await assertFails(getDoc(doc(adminDb(env), "aiJournalOutputs/o1")));
  });

  it("KHÔNG ai create được từ client — kể cả chính chủ, chỉ Cloud Function qua Admin SDK", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "aiJournalOutputs/o1"), AI_OUTPUT));
  });

  it("Guest KHÔNG create được", async () => {
    await assertFails(setDoc(doc(guestDb(env), "aiJournalOutputs/o1"), AI_OUTPUT));
  });

  it("chủ sở hữu delete được output của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiJournalOutputs/o1"), AI_OUTPUT); });
    await assertSucceeds(deleteDoc(doc(authedDb(env, "u1"), "aiJournalOutputs/o1")));
  });

  it("chủ sở hữu update được chỉ để đặt userFeedback", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiJournalOutputs/o1"), AI_OUTPUT); });
    await assertSucceeds(
      updateDoc(doc(authedDb(env, "u1"), "aiJournalOutputs/o1"), { userFeedback: "helpful" }),
    );
  });

  it("update sửa reflectionText bị từ chối", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiJournalOutputs/o1"), AI_OUTPUT); });
    await assertFails(
      updateDoc(doc(authedDb(env, "u1"), "aiJournalOutputs/o1"), { reflectionText: "nội dung giả mạo" }),
    );
  });

  it("update đổi userId bị từ chối (bài học từ lỗ hổng moodLogs.userId)", async () => {
    // Kịch bản tấn công: u2 tự tạo doc (giả lập Cloud Function) mang uid của
    // chính mình, rồi cố update lại userId thành uid nạn nhân để "cấy" phản
    // chiếu AI vào tài khoản người khác.
    await seed(env, async (db) => {
      await setDoc(doc(db, "aiJournalOutputs/o1"), { ...AI_OUTPUT, userId: "u2" });
    });
    await assertFails(
      updateDoc(doc(authedDb(env, "u2"), "aiJournalOutputs/o1"), { userId: "u1" }),
    );
  });

  // --- Fix round 1 / Finding 1+2: hasOnly() phải khoá TOÀN BỘ field khác,
  // không chỉ 2 field từng bị pin riêng lẻ (userId, reflectionText). ---

  it("update sửa catStoryText (nội dung AI-generated) bị từ chối", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiJournalOutputs/o1"), AI_OUTPUT); });
    await assertFails(
      updateDoc(doc(authedDb(env, "u1"), "aiJournalOutputs/o1"), { catStoryText: "câu chuyện giả mạo" }),
    );
  });

  it("update sửa journalPrompt (nội dung AI-generated) bị từ chối", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiJournalOutputs/o1"), AI_OUTPUT); });
    await assertFails(
      updateDoc(doc(authedDb(env, "u1"), "aiJournalOutputs/o1"), { journalPrompt: "prompt giả mạo" }),
    );
  });

  it("update sửa promptTemplateId (dấu vết provenance) bị từ chối", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiJournalOutputs/o1"), AI_OUTPUT); });
    await assertFails(
      updateDoc(doc(authedDb(env, "u1"), "aiJournalOutputs/o1"), { promptTemplateId: "pt-khac" }),
    );
  });

  it("update sửa createdAt (dấu vết provenance) bị từ chối", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiJournalOutputs/o1"), AI_OUTPUT); });
    await assertFails(
      updateDoc(doc(authedDb(env, "u1"), "aiJournalOutputs/o1"), { createdAt: new Date("2020-01-01") }),
    );
  });

  it("update thêm field lạ ngoài schema bị từ chối", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiJournalOutputs/o1"), AI_OUTPUT); });
    await assertFails(
      updateDoc(doc(authedDb(env, "u1"), "aiJournalOutputs/o1"), { hacked: true }),
    );
  });

  it("update userFeedback giá trị ngoài enum (\"helpful\" | \"not_helpful\") bị từ chối", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiJournalOutputs/o1"), AI_OUTPUT); });
    await assertFails(
      updateDoc(doc(authedDb(env, "u1"), "aiJournalOutputs/o1"), { userFeedback: "spam-giá-trị-lạ" }),
    );
  });

  // --- Finding 4: isolation cho update/delete, tương tự moodLogs/cbtSessions ---

  it("user khác KHÔNG update được userFeedback của output không phải của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiJournalOutputs/o1"), AI_OUTPUT); });
    await assertFails(
      updateDoc(doc(authedDb(env, "u2"), "aiJournalOutputs/o1"), { userFeedback: "helpful" }),
    );
  });

  it("user khác KHÔNG xoá được output không phải của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiJournalOutputs/o1"), AI_OUTPUT); });
    await assertFails(deleteDoc(doc(authedDb(env, "u2"), "aiJournalOutputs/o1")));
  });

  it("ADMIN CŨNG KHÔNG update, KHÔNG xoá được output của học sinh", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiJournalOutputs/o1"), AI_OUTPUT); });
    const db = adminDb(env);
    await assertFails(updateDoc(doc(db, "aiJournalOutputs/o1"), { userFeedback: "helpful" }));
    await assertFails(deleteDoc(doc(db, "aiJournalOutputs/o1")));
  });
});

describe("aiUsage/{id}", () => {
  it("KHÔNG ai đọc được — kể cả chủ sở hữu", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiUsage/u1"), USAGE); });
    await assertFails(getDoc(doc(authedDb(env, "u1"), "aiUsage/u1")));
  });

  it("ADMIN CŨNG KHÔNG đọc được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiUsage/u1"), USAGE); });
    await assertFails(getDoc(doc(adminDb(env), "aiUsage/u1")));
  });

  it("KHÔNG ai ghi được từ client — kể cả chủ sở hữu, kể cả admin", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "aiUsage/u1"), USAGE));
    await assertFails(setDoc(doc(adminDb(env), "aiUsage/u1"), USAGE));
  });
});

describe("systemConfig/{id}", () => {
  it("Admin đọc được config thường (vd aiConfig)", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "systemConfig/aiConfig"), AI_CONFIG); });
    await assertSucceeds(getDoc(doc(adminDb(env), "systemConfig/aiConfig")));
  });

  it("Admin ghi được config thường", async () => {
    await assertSucceeds(setDoc(doc(adminDb(env), "systemConfig/aiConfig"), AI_CONFIG));
  });

  it("Student KHÔNG đọc được config thường", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "systemConfig/aiConfig"), AI_CONFIG); });
    await assertFails(getDoc(doc(authedDb(env, "u1"), "systemConfig/aiConfig")));
  });

  it("Student KHÔNG ghi được config thường", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "systemConfig/aiConfig"), AI_CONFIG));
  });

  // --- R1: ngoại lệ systemConfig/aiPublic ---

  it("Student (signed-in) đọc được systemConfig/aiPublic", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "systemConfig/aiPublic"), AI_PUBLIC); });
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "systemConfig/aiPublic")));
  });

  it("Student KHÔNG đọc được systemConfig/aiConfig dù aiPublic đã mở (đối chứng R1)", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "systemConfig/aiPublic"), AI_PUBLIC);
      await setDoc(doc(db, "systemConfig/aiConfig"), AI_CONFIG);
    });
    await assertFails(getDoc(doc(authedDb(env, "u1"), "systemConfig/aiConfig")));
  });

  it("Guest KHÔNG đọc được systemConfig/aiPublic", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "systemConfig/aiPublic"), AI_PUBLIC); });
    await assertFails(getDoc(doc(guestDb(env), "systemConfig/aiPublic")));
  });

  it("Student KHÔNG ghi được systemConfig/aiPublic", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "systemConfig/aiPublic"), AI_PUBLIC));
  });

  it("Admin ghi được systemConfig/aiPublic", async () => {
    await assertSucceeds(setDoc(doc(adminDb(env), "systemConfig/aiPublic"), AI_PUBLIC));
  });
});

describe("promptTemplates/{id}", () => {
  it("Admin đọc được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "promptTemplates/pt1"), PROMPT_TEMPLATE); });
    await assertSucceeds(getDoc(doc(adminDb(env), "promptTemplates/pt1")));
  });

  it("Admin ghi được", async () => {
    await assertSucceeds(setDoc(doc(adminDb(env), "promptTemplates/pt1"), PROMPT_TEMPLATE));
  });

  it("Student KHÔNG đọc được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "promptTemplates/pt1"), PROMPT_TEMPLATE); });
    await assertFails(getDoc(doc(authedDb(env, "u1"), "promptTemplates/pt1")));
  });

  it("Student KHÔNG ghi được", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "promptTemplates/pt1"), PROMPT_TEMPLATE));
  });
});

describe("aiSafetyLog/{id}", () => {
  it("Admin đọc được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiSafetyLog/l1"), SAFETY_LOG); });
    await assertSucceeds(getDoc(doc(adminDb(env), "aiSafetyLog/l1")));
  });

  it("Student KHÔNG đọc được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "aiSafetyLog/l1"), SAFETY_LOG); });
    await assertFails(getDoc(doc(authedDb(env, "u1"), "aiSafetyLog/l1")));
  });

  it("KHÔNG ai ghi được từ client — cả student và admin", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "aiSafetyLog/l1"), SAFETY_LOG));
    await assertFails(setDoc(doc(adminDb(env), "aiSafetyLog/l1"), SAFETY_LOG));
  });
});

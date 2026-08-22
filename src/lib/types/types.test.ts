import { describe, it, expect } from "vitest";
import { userProfileSchema } from "./user";
import { testDefinitionSchema, testAttemptSchema } from "./test";
import { moodLogSchema } from "./mood";
import { resourceSchema } from "./resource";

describe("userProfileSchema", () => {
  it("chấp nhận hồ sơ hợp lệ", () => {
    const r = userProfileSchema.safeParse({
      uid: "u1", role: "student", nickname: "Mèo con", gradeLevel: "12",
      school: "THPT Trần Phú", examGoals: ["Khối A"],
      privacySettings: { aiOptIn: false, shareImageWithAI: false },
      researchConsent: null, deletionRequestedAt: null,
    });
    expect(r.success).toBe(true);
  });

  it("từ chối gradeLevel không hợp lệ", () => {
    const r = userProfileSchema.safeParse({
      uid: "u1", role: "student", nickname: "A", gradeLevel: "9",
      school: "X", examGoals: [],
      privacySettings: { aiOptIn: false, shareImageWithAI: false },
      researchConsent: null, deletionRequestedAt: null,
    });
    expect(r.success).toBe(false);
  });

  it("từ chối nickname rỗng", () => {
    const r = userProfileSchema.safeParse({
      uid: "u1", role: "student", nickname: "", gradeLevel: "10",
      school: "X", examGoals: [],
      privacySettings: { aiOptIn: false, shareImageWithAI: false },
      researchConsent: null, deletionRequestedAt: null,
    });
    expect(r.success).toBe(false);
  });
});

describe("moodLogSchema", () => {
  it("chấp nhận moodScore trong khoảng 1..10", () => {
    const base = {
      userId: "u1", moodIcon: "calm", note: "", tags: [],
      context: "standalone", linkedActivityRef: null, imageUrl: null,
    };
    expect(moodLogSchema.safeParse({ ...base, moodScore: 1 }).success).toBe(true);
    expect(moodLogSchema.safeParse({ ...base, moodScore: 10 }).success).toBe(true);
  });

  it("từ chối moodScore ngoài khoảng", () => {
    const base = {
      userId: "u1", moodIcon: "calm", note: "", tags: [],
      context: "standalone", linkedActivityRef: null, imageUrl: null,
    };
    expect(moodLogSchema.safeParse({ ...base, moodScore: 0 }).success).toBe(false);
    expect(moodLogSchema.safeParse({ ...base, moodScore: 11 }).success).toBe(false);
    expect(moodLogSchema.safeParse({ ...base, moodScore: 5.5 }).success).toBe(false);
  });
});

describe("testDefinitionSchema", () => {
  it("bắt buộc có disclaimer không rỗng", () => {
    const r = testDefinitionSchema.safeParse({
      title: "T", version: 1, status: "draft", isSampleContent: true,
      questions: [], scoring: { thresholds: [] }, disclaimer: "", updatedBy: "a",
    });
    expect(r.success).toBe(false);
  });
});

describe("testAttemptSchema", () => {
  it("chấp nhận lượt làm bài hợp lệ", () => {
    const r = testAttemptSchema.safeParse({
      userId: "u1", testId: "t1", testVersion: 1,
      answers: { q1: 2 }, score: 2, level: "nhe",
    });
    expect(r.success).toBe(true);
  });
});

describe("resourceSchema", () => {
  it("từ chối slug có ký tự hoa hoặc dấu cách", () => {
    const base = {
      title: "A", type: "article", category: "c", tags: [],
      content: "x", videoUrl: null, status: "draft",
      visibility: "public", createdBy: "a",
    };
    expect(resourceSchema.safeParse({ ...base, slug: "Ky Thuat" }).success).toBe(false);
    expect(resourceSchema.safeParse({ ...base, slug: "ky-thuat-tho" }).success).toBe(true);
  });
});

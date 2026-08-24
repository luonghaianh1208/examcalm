import { describe, expect, it } from "vitest";
import {
  aiConfigSchema,
  promptTemplateSchema,
  aiJournalOutputSchema,
  DEFAULT_AI_CONFIG,
} from "@/lib/types/ai";

const VALID_AI_CONFIG = {
  providerLabel: "DeepSeek",
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  temperature: 0.7,
  maxTokens: 500,
  quotaStudentPerDay: 5,
  rateLimitPerMinute: 3,
  killSwitch: { moodReflection: true },
};

describe("aiConfigSchema", () => {
  it("chấp nhận một config hợp lệ đầy đủ", () => {
    expect(aiConfigSchema.safeParse(VALID_AI_CONFIG).success).toBe(true);
  });

  it("từ chối baseUrl dùng http:// trừ localhost và 127.0.0.1", () => {
    const remoteHttp = { ...VALID_AI_CONFIG, baseUrl: "http://api.deepseek.com/v1" };
    expect(aiConfigSchema.safeParse(remoteHttp).success).toBe(false);

    const localhost = { ...VALID_AI_CONFIG, baseUrl: "http://localhost:11434/v1" };
    expect(aiConfigSchema.safeParse(localhost).success).toBe(true);

    const loopback = { ...VALID_AI_CONFIG, baseUrl: "http://127.0.0.1:11434/v1/chat" };
    expect(aiConfigSchema.safeParse(loopback).success).toBe(true);
  });

  it("từ chối host giả dạng localhost/127.0.0.1 (lookalike host trên Internet)", () => {
    // "localhost.evil.com" và "127.0.0.1.evil.com" là host Internet bình
    // thường chỉ TÌNH CỜ bắt đầu bằng tên loopback — không phải máy nội bộ.
    // Test này chốt hành vi hiện tại để một lần sửa regex sau này không
    // âm thầm mở lỗ hổng bypass https.
    const fakeLocalhost = { ...VALID_AI_CONFIG, baseUrl: "http://localhost.evil.com/v1" };
    expect(aiConfigSchema.safeParse(fakeLocalhost).success).toBe(false);

    const fakeLoopback = { ...VALID_AI_CONFIG, baseUrl: "http://127.0.0.1.evil.com/v1" };
    expect(aiConfigSchema.safeParse(fakeLoopback).success).toBe(false);
  });

  it("từ chối baseUrl không phải URL", () => {
    const bad = { ...VALID_AI_CONFIG, baseUrl: "khong-phai-url" };
    expect(aiConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("quotaStudentPerDay phải là số nguyên >= 0, 0 hợp lệ nghĩa là tắt", () => {
    expect(
      aiConfigSchema.safeParse({ ...VALID_AI_CONFIG, quotaStudentPerDay: 0 }).success,
    ).toBe(true);
    expect(
      aiConfigSchema.safeParse({ ...VALID_AI_CONFIG, quotaStudentPerDay: -1 }).success,
    ).toBe(false);
    expect(
      aiConfigSchema.safeParse({ ...VALID_AI_CONFIG, quotaStudentPerDay: 1.5 }).success,
    ).toBe(false);
  });

  it("maxTokens có trần cứng, từ chối giá trị > 2000", () => {
    expect(aiConfigSchema.safeParse({ ...VALID_AI_CONFIG, maxTokens: 2000 }).success).toBe(
      true,
    );
    expect(aiConfigSchema.safeParse({ ...VALID_AI_CONFIG, maxTokens: 2001 }).success).toBe(
      false,
    );
  });

  it("temperature trong khoảng [0, 1]", () => {
    expect(aiConfigSchema.safeParse({ ...VALID_AI_CONFIG, temperature: 0 }).success).toBe(
      true,
    );
    expect(aiConfigSchema.safeParse({ ...VALID_AI_CONFIG, temperature: 1 }).success).toBe(
      true,
    );
    expect(aiConfigSchema.safeParse({ ...VALID_AI_CONFIG, temperature: -0.1 }).success).toBe(
      false,
    );
    expect(aiConfigSchema.safeParse({ ...VALID_AI_CONFIG, temperature: 1.1 }).success).toBe(
      false,
    );
  });

  it("không có trường nào tên chứa key, secret, hay token", () => {
    const fieldNames = Object.keys(aiConfigSchema.shape);
    // maxTokens là ngoại lệ có chủ đích: đây là trần số lượng token phản
    // hồi của LLM (design spec §5.1), không phải thông tin xác thực. Regex
    // \b không phân biệt được "maxTokens" với "apiToken" vì cả hai đều là
    // một cụm camelCase liền, không có ranh giới \b nội bộ — nên phải loại
    // trừ đích danh field này thay vì sửa regex.
    for (const name of fieldNames) {
      if (name === "maxTokens") continue;
      expect(name).not.toMatch(/key|secret|token/i);
    }
  });
});

describe("DEFAULT_AI_CONFIG", () => {
  it("có baseUrl rỗng, model rỗng, và kill switch đang tắt (true)", () => {
    expect(DEFAULT_AI_CONFIG.baseUrl).toBe("");
    expect(DEFAULT_AI_CONFIG.model).toBe("");
    expect(DEFAULT_AI_CONFIG.killSwitch.moodReflection).toBe(true);
  });

  it("tự khớp với aiConfigSchema của chính nó", () => {
    // Đây là fix thật sự: hằng số mặc định phải luôn parse được bằng schema
    // mà nó khai báo kiểu — nếu không, action "reset về mặc định" hay
    // fallback "chưa cấu hình" ở task sau sẽ ném ZodError bất ngờ.
    expect(aiConfigSchema.safeParse(DEFAULT_AI_CONFIG).success).toBe(true);
  });
});

describe("promptTemplateSchema", () => {
  const VALID_TEMPLATE = {
    name: "mood-reflection",
    version: 1,
    status: "draft" as const,
    systemPrompt: "Bạn là một người bạn đồng hành hỗ trợ cảm xúc.",
    userTemplate: "Học sinh vừa ghi lại: {{moodNote}}",
    updatedBy: "admin-uid",
    updatedAt: new Date(),
  };

  it("chấp nhận template hợp lệ", () => {
    expect(promptTemplateSchema.safeParse(VALID_TEMPLATE).success).toBe(true);
  });

  it("bắt buộc systemPrompt không rỗng", () => {
    expect(
      promptTemplateSchema.safeParse({ ...VALID_TEMPLATE, systemPrompt: "" }).success,
    ).toBe(false);
  });

  it("bắt buộc userTemplate không rỗng", () => {
    expect(
      promptTemplateSchema.safeParse({ ...VALID_TEMPLATE, userTemplate: "" }).success,
    ).toBe(false);
  });
});

describe("aiJournalOutputSchema", () => {
  const VALID_OUTPUT = {
    userId: "u1",
    moodLogId: "m1",
    reflectionText: "Cảm xúc của bạn là hợp lý.",
    catStoryText: "Chú mèo nhỏ hít thở thật sâu.",
    journalPrompt: "Hôm nay điều gì khiến bạn thấy nhẹ nhõm hơn?",
    promptTemplateId: "tpl1",
    promptVersion: 1,
    providerLabel: "DeepSeek",
    model: "deepseek-chat",
    userFeedback: null,
    createdAt: new Date(),
  };

  it("chấp nhận output hợp lệ", () => {
    expect(aiJournalOutputSchema.safeParse(VALID_OUTPUT).success).toBe(true);
  });

  it("bắt buộc reflectionText không rỗng", () => {
    expect(
      aiJournalOutputSchema.safeParse({ ...VALID_OUTPUT, reflectionText: "" }).success,
    ).toBe(false);
  });

  it("userFeedback nhận helpful, not_helpful, hoặc null", () => {
    expect(
      aiJournalOutputSchema.safeParse({ ...VALID_OUTPUT, userFeedback: "helpful" }).success,
    ).toBe(true);
    expect(
      aiJournalOutputSchema.safeParse({ ...VALID_OUTPUT, userFeedback: "not_helpful" })
        .success,
    ).toBe(true);
    expect(
      aiJournalOutputSchema.safeParse({ ...VALID_OUTPUT, userFeedback: "khac" }).success,
    ).toBe(false);
  });
});

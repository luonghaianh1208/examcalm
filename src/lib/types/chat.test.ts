import { describe, expect, it } from "vitest";
import {
  chatSessionSchema,
  chatMessageSchema,
  crisisAlertSchema,
  CHAT_WINDOW_SIZE,
  CHAT_MESSAGE_MAX_CHARS,
} from "@/lib/types/chat";

const VALID_SESSION = {
  userId: "u1",
  startedAt: new Date(),
  lastMessageAt: new Date(),
  messageCount: 1,
};

const VALID_MESSAGE = {
  userId: "u1",
  sessionId: "s1",
  role: "user" as const,
  text: "Em thấy hồi hộp trước kỳ thi.",
  isCrisisResponse: false,
  createdAt: new Date(),
};

const VALID_ALERT = {
  userId: "u1",
  severity: "concern" as const,
  triggeredBy: "keyword" as const,
  createdAt: new Date(),
  handledBy: null,
  handledAt: null,
};

describe("chatMessageSchema", () => {
  it("chấp nhận một tin nhắn hợp lệ", () => {
    expect(chatMessageSchema.safeParse(VALID_MESSAGE).success).toBe(true);
  });

  it("role chỉ nhận 'user' hoặc 'assistant'", () => {
    expect(chatMessageSchema.safeParse({ ...VALID_MESSAGE, role: "assistant" }).success).toBe(
      true,
    );
    expect(chatMessageSchema.safeParse({ ...VALID_MESSAGE, role: "system" }).success).toBe(
      false,
    );
  });

  it("từ chối text rỗng", () => {
    expect(chatMessageSchema.safeParse({ ...VALID_MESSAGE, text: "" }).success).toBe(false);
  });

  it("CHAT_MESSAGE_MAX_CHARS là số nguyên dương (đề xuất 2000)", () => {
    expect(Number.isInteger(CHAT_MESSAGE_MAX_CHARS)).toBe(true);
    expect(CHAT_MESSAGE_MAX_CHARS).toBeGreaterThan(0);
  });

  it("text đúng trần CHAT_MESSAGE_MAX_CHARS thì hợp lệ, dài hơn 1 ký tự thì bị từ chối", () => {
    const atCap = { ...VALID_MESSAGE, text: "a".repeat(CHAT_MESSAGE_MAX_CHARS) };
    expect(chatMessageSchema.safeParse(atCap).success).toBe(true);

    const overCap = { ...VALID_MESSAGE, text: "a".repeat(CHAT_MESSAGE_MAX_CHARS + 1) };
    expect(chatMessageSchema.safeParse(overCap).success).toBe(false);
  });

  it("isCrisisResponse phải là boolean", () => {
    expect(
      chatMessageSchema.safeParse({ ...VALID_MESSAGE, isCrisisResponse: "true" }).success,
    ).toBe(false);
  });
});

describe("chatSessionSchema", () => {
  it("chấp nhận một session hợp lệ", () => {
    expect(chatSessionSchema.safeParse(VALID_SESSION).success).toBe(true);
  });

  it("messageCount phải là số nguyên không âm", () => {
    expect(chatSessionSchema.safeParse({ ...VALID_SESSION, messageCount: 0 }).success).toBe(
      true,
    );
    expect(chatSessionSchema.safeParse({ ...VALID_SESSION, messageCount: -1 }).success).toBe(
      false,
    );
    expect(chatSessionSchema.safeParse({ ...VALID_SESSION, messageCount: 1.5 }).success).toBe(
      false,
    );
  });

  it("từ chối userId rỗng", () => {
    expect(chatSessionSchema.safeParse({ ...VALID_SESSION, userId: "" }).success).toBe(false);
  });
});

describe("crisisAlertSchema", () => {
  it("chấp nhận một cảnh báo hợp lệ (chưa xử lý)", () => {
    expect(crisisAlertSchema.safeParse(VALID_ALERT).success).toBe(true);
  });

  it("chấp nhận cảnh báo đã được xử lý", () => {
    const handled = { ...VALID_ALERT, handledBy: "admin-uid", handledAt: new Date() };
    expect(crisisAlertSchema.safeParse(handled).success).toBe(true);
  });

  it("severity chỉ nhận 'urgent' hoặc 'concern'", () => {
    expect(crisisAlertSchema.safeParse({ ...VALID_ALERT, severity: "urgent" }).success).toBe(
      true,
    );
    expect(crisisAlertSchema.safeParse({ ...VALID_ALERT, severity: "high" }).success).toBe(
      false,
    );
  });

  it("triggeredBy chỉ nhận 'keyword', 'model', hoặc 'both'", () => {
    expect(crisisAlertSchema.safeParse({ ...VALID_ALERT, triggeredBy: "model" }).success).toBe(
      true,
    );
    expect(crisisAlertSchema.safeParse({ ...VALID_ALERT, triggeredBy: "both" }).success).toBe(
      true,
    );
    expect(crisisAlertSchema.safeParse({ ...VALID_ALERT, triggeredBy: "ai" }).success).toBe(
      false,
    );
  });

  it("có đúng 6 field: userId, severity, triggeredBy, createdAt, handledBy, handledAt", () => {
    const fieldNames = Object.keys(crisisAlertSchema.shape).sort();
    expect(fieldNames).toEqual(
      ["createdAt", "handledAt", "handledBy", "severity", "triggeredBy", "userId"].sort(),
    );
  });

  // Guard load-bearing (xem design spec §3.4): cảnh báo không được mang nguyên văn học sinh
  // viết — việc của thầy cô là đi gặp em đó, không phải đọc em viết gì. Test này đọc field
  // name TẠI RUNTIME từ chính schema, không phải danh sách chép tay, nên vẫn bắt được nếu
  // sau này có ai thêm field mới vào schema mà quên kiểm tra lại quy tắc này.
  it("không có field nào tên chứa text, message, content, excerpt, hay summary", () => {
    const fieldNames = Object.keys(crisisAlertSchema.shape);
    for (const name of fieldNames) {
      expect(name).not.toMatch(/text|message|content|excerpt|summary/i);
    }
  });
});

describe("CHAT_WINDOW_SIZE", () => {
  it("là số nguyên dương", () => {
    expect(Number.isInteger(CHAT_WINDOW_SIZE)).toBe(true);
    expect(CHAT_WINDOW_SIZE).toBeGreaterThan(0);
  });
});

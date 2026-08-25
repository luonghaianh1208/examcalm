import { describe, expect, it, vi, beforeEach } from "vitest";

const ensureAuthReady = vi.fn(async () => {});
const addDocMock = vi.fn<(ref: unknown, data: unknown) => Promise<{ id: string }>>(async () => ({
  id: "s1",
}));
const getDocsMock = vi.fn(async () => ({ docs: [] as unknown[] }));
const deleteDocMock = vi.fn<(ref: unknown) => Promise<void>>(async () => {});
const batchDeleteMock = vi.fn();
const batchCommitMock = vi.fn<() => Promise<void>>(async () => {});
const writeBatchMock = vi.fn(() => ({ delete: batchDeleteMock, commit: batchCommitMock }));
const callSendChatMessageMock = vi.fn<
  (sessionId: string, text: string) => Promise<{ messageId: string }>
>(async () => ({ messageId: "msg1" }));

vi.mock("@/lib/firebase/client", () => ({
  getDb: () => ({}),
  ensureAuthReady,
}));

vi.mock("@/lib/firebase/functions-client", () => ({
  callSendChatMessage: callSendChatMessageMock,
}));

// Timestamp giả lập — phải là class thật để `instanceof` trong chat.ts nhận ra, giống hệt
// cách ai-outputs.test.ts giả lập (xem comment ở đó).
class MockTimestamp {
  constructor(private readonly date: Date) {}
  toDate(): Date {
    return this.date;
  }
}

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: (...args: unknown[]) => ({ id: String(args.at(-1)) }),
  addDoc: addDocMock,
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  serverTimestamp: () => "SERVER_TS",
  getDocs: getDocsMock,
  deleteDoc: deleteDocMock,
  writeBatch: writeBatchMock,
  Timestamp: MockTimestamp,
}));

const {
  startChatSession,
  sendMessage,
  listMessages,
  listMySessions,
  deleteMessage,
  deleteSession,
  ChatSendError,
} = await import("@/lib/firestore/chat");

// Bản ghi tin nhắn giả khớp chatMessageSchema (src/lib/types/chat.ts).
function makeMessageDoc(overrides: Record<string, unknown> = {}) {
  const data = {
    userId: "u1",
    sessionId: "s1",
    role: "user",
    text: "Em thấy lo lắng quá",
    isCrisisResponse: false,
    createdAt: new MockTimestamp(new Date("2026-08-24T00:00:00Z")),
    // Trường KHÔNG có trong ChatMessageRecord/chatMessageSchema — cố ý để đây, cùng lý do
    // ai-outputs.test.ts::makeDoc: nếu mapMessageDoc quay lại spread, trường này lọt vào kết
    // quả và làm Object.keys(result).sort() lệch danh sách mong đợi, khiến guard bắt được.
    internalDebugNote: "không thuộc schema — mô phỏng field lạ trong document thật",
    ...overrides,
  };
  return { id: "m1", ref: { id: "m1" }, data: () => data };
}

// Bản ghi phiên chat giả khớp chatSessionSchema (src/lib/types/chat.ts).
function makeSessionDoc(overrides: Record<string, unknown> = {}) {
  const data = {
    userId: "u1",
    startedAt: new MockTimestamp(new Date("2026-08-24T00:00:00Z")),
    lastMessageAt: new MockTimestamp(new Date("2026-08-24T00:05:00Z")),
    messageCount: 3,
    // Trường lạ ngoài mô hình — cùng lý do makeMessageDoc ở trên.
    internalDebugNote: "không thuộc schema",
    ...overrides,
  };
  return { id: "s1", ref: { id: "s1" }, data: () => data };
}

// Lỗi Firestore SDK thô điển hình (FirestoreError thật, KHÔNG có tiền tố "functions/") —
// dùng để mô phỏng đúng trigger Finding 1 (coordinator): học sinh chưa xác thực email gọi
// startChatSession (firestore.rules đòi isVerified() để tạo chatSessions), hoặc
// deleteSession trên session không thuộc về mình khiến cả batch bị từ chối.
const RAW_PERMISSION_DENIED = {
  code: "permission-denied",
  message: "Missing or insufficient permissions.",
};

async function captureThrownMessage(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    throw new Error("lẽ ra phải throw nhưng không throw");
  } catch (err) {
    return (err as Error).message;
  }
}

beforeEach(() => {
  ensureAuthReady.mockClear();
  addDocMock.mockClear();
  addDocMock.mockResolvedValue({ id: "s1" });
  getDocsMock.mockClear();
  getDocsMock.mockResolvedValue({ docs: [] });
  deleteDocMock.mockClear();
  deleteDocMock.mockResolvedValue(undefined);
  batchDeleteMock.mockClear();
  batchCommitMock.mockClear();
  batchCommitMock.mockResolvedValue(undefined);
  writeBatchMock.mockClear();
  callSendChatMessageMock.mockClear();
  callSendChatMessageMock.mockResolvedValue({ messageId: "msg1" });
});

describe("startChatSession", () => {
  it("gọi ensureAuthReady TRƯỚC khi ghi", async () => {
    await startChatSession("u1");
    expect(ensureAuthReady.mock.invocationCallOrder[0]).toBeLessThan(
      addDocMock.mock.invocationCallOrder[0]!,
    );
  });

  it("ghi đúng userId, messageCount = 0, và trả về id vừa tạo", async () => {
    const id = await startChatSession("u1");
    const written = addDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(written.userId).toBe("u1");
    expect(written.messageCount).toBe(0);
    expect(id).toBe("s1");
  });

  // Fix round 1 (Finding 1, coordinator): trigger thật — học sinh chưa xác thực email gọi
  // startChatSession, firestore.rules đòi isVerified() để create → permission-denied thô.
  it("lỗi permission-denied thô từ Firestore (vd chưa xác thực email) không lọt ra ngoài", async () => {
    addDocMock.mockRejectedValue(RAW_PERMISSION_DENIED);
    const message = await captureThrownMessage(() => startChatSession("u1"));
    expect(message).not.toContain("permission-denied");
    expect(message).not.toContain("Missing or insufficient permissions");
    expect(message.length).toBeGreaterThan(0);
  });
});

describe("sendMessage", () => {
  it("gọi ensureAuthReady TRƯỚC khi gọi callable", async () => {
    await sendMessage("s1", "Em thấy lo lắng quá");
    expect(ensureAuthReady.mock.invocationCallOrder[0]).toBeLessThan(
      callSendChatMessageMock.mock.invocationCallOrder[0]!,
    );
  });

  it("truyền đúng sessionId/text và trả về nguyên kết quả khi thành công", async () => {
    const result = await sendMessage("s9", "Nội dung");
    expect(callSendChatMessageMock).toHaveBeenCalledWith("s9", "Nội dung");
    expect(result).toEqual({ messageId: "msg1" });
  });

  async function captureMessage(rejection: unknown): Promise<string> {
    callSendChatMessageMock.mockRejectedValue(rejection);
    try {
      await sendMessage("s1", "abc");
      throw new Error("sendMessage lẽ ra phải throw nhưng không throw");
    } catch (err) {
      return (err as Error).message;
    }
  }

  // Fix round 1 (Finding 3, coordinator): phân biệt bằng details.reason, KHÔNG còn
  // regex/substring lại câu tiếng Việt của server — đổi câu chữ server không còn âm thầm
  // phá cách nhận diện của client (cùng dạng lỗi Spec #3 Task 8 đã mắc với
  // extractTriggeredKeyword).
  describe("resource-exhausted — quota ngày vs rate limit cần thông điệp khác nhau, phân biệt bằng details.reason", () => {
    it("details.reason = 'quota' → thông điệp 'hết lượt hôm nay', KHÔNG dùng từ 'lỗi', không hàm ý em làm sai", async () => {
      const message = await captureMessage({
        code: "functions/resource-exhausted",
        details: { reason: "quota" },
      });
      expect(message).toContain("hết lượt");
      expect(message).toContain("hôm nay");
      expect(message).not.toContain("lỗi");
      expect(message).not.toContain("resource-exhausted");
    });

    it("details.reason = 'rate_limit' → thông điệp khác, không nói 'hết lượt hôm nay'", async () => {
      const message = await captureMessage({
        code: "functions/resource-exhausted",
        details: { reason: "rate_limit" },
      });
      expect(message).not.toContain("hết lượt");
      expect(message).not.toContain("hôm nay");
      expect(message).toMatch(/chờ|đợi/);
      expect(message).not.toContain("lỗi");
    });

    // Đổi câu chữ message server (vd sửa lại câu tiếng Việt cho mượt hơn) KHÔNG được phép
    // đổi thông điệp client nhận — chỉ details.reason mới quyết định, message bị bỏ qua.
    it("message server đổi câu chữ nhưng details.reason = 'quota' → vẫn đúng thông điệp hết lượt hôm nay", async () => {
      const message = await captureMessage({
        code: "functions/resource-exhausted",
        message: "Một câu hoàn toàn khác, không còn cụm 'hôm nay' nào.",
        details: { reason: "quota" },
      });
      expect(message).toContain("hết lượt");
      expect(message).toContain("hôm nay");
    });

    it("thiếu details (hình dạng lỗi không đầy đủ) → mặc định về nhánh rate limit, không throw runtime, không bịa 'hết lượt hôm nay'", async () => {
      const message = await captureMessage({ code: "functions/resource-exhausted" });
      expect(message).not.toContain("hết lượt hôm nay");
      expect(message).not.toContain("resource-exhausted");
    });

    it("details.reason không phải string hoặc hình dạng details hỏng → không throw khi dựng thông điệp", async () => {
      const message = await captureMessage({
        code: "functions/resource-exhausted",
        details: { reason: 12345 },
      });
      expect(typeof message).toBe("string");
      expect(message.length).toBeGreaterThan(0);
    });
  });

  // Fix round 1 cho Task 7 (Finding 2, coordinator): sendMessage phải ném ChatSendError mang
  // `kind` máy đọc được — để ChatWindow phân biệt "hết quota"/"rate limit" (không phải lỗi,
  // không hiện role="alert" đỏ) khỏi lỗi thật, KHÔNG quay lại string-match câu tiếng Việt.
  describe("ném ChatSendError kèm kind máy đọc được", () => {
    it("resource-exhausted + reason='quota' → kind='quota'", async () => {
      callSendChatMessageMock.mockRejectedValue({
        code: "functions/resource-exhausted",
        details: { reason: "quota" },
      });
      const err = await sendMessage("s1", "abc").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ChatSendError);
      expect((err as InstanceType<typeof ChatSendError>).kind).toBe("quota");
    });

    it("resource-exhausted + reason='rate_limit' → kind='rate_limit'", async () => {
      callSendChatMessageMock.mockRejectedValue({
        code: "functions/resource-exhausted",
        details: { reason: "rate_limit" },
      });
      const err = await sendMessage("s1", "abc").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ChatSendError);
      expect((err as InstanceType<typeof ChatSendError>).kind).toBe("rate_limit");
    });

    it("mã lỗi khác (vd permission-denied, internal) → kind='error'", async () => {
      callSendChatMessageMock.mockRejectedValue({ code: "functions/internal" });
      const err = await sendMessage("s1", "abc").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ChatSendError);
      expect((err as InstanceType<typeof ChatSendError>).kind).toBe("error");
    });
  });

  describe("permission-denied", () => {
    it("details.reason = email_unverified → nhắc xác thực email", async () => {
      const message = await captureMessage({
        code: "functions/permission-denied",
        details: { reason: "email_unverified" },
      });
      expect(message).toMatch(/xác thực email/);
      expect(message).not.toContain("permission-denied");
    });

    it("details.reason = ai_opt_in → trỏ tới Cài đặt riêng tư", async () => {
      const message = await captureMessage({
        code: "functions/permission-denied",
        details: { reason: "ai_opt_in" },
      });
      expect(message).toMatch(/cài đặt|Cài đặt/);
      expect(message).not.toContain("ai_opt_in");
    });

    it("không có details (vd session không thuộc về mình) → thông điệp trung tính, không xác nhận session tồn tại", async () => {
      const message = await captureMessage({ code: "functions/permission-denied" });
      expect(message).not.toMatch(/cài đặt|Cài đặt/);
      expect(message).not.toMatch(/xác thực email/);
      expect(message).not.toContain("permission-denied");
    });
  });

  it("failed-precondition: thông điệp trung tính, không phơi mã lỗi thô", async () => {
    const message = await captureMessage({ code: "functions/failed-precondition" });
    expect(message).not.toContain("failed-precondition");
    expect(message).toMatch(/chưa sẵn sàng|đang tắt/);
  });

  // Fix round 1 (Finding 4, coordinator): callable ném invalid-argument cho CẢ sessionId
  // sai hình dạng LẪN nội dung tin nhắn rỗng/quá dài (một message chung, xem
  // sendChatMessage.ts) — thông điệp client phải phủ cả hai, không chỉ đổ cho "nội dung".
  it("invalid-argument: phủ cả hai nguyên nhân (session hoặc nội dung), không đổ hết cho nội dung tin nhắn", async () => {
    const message = await captureMessage({ code: "functions/invalid-argument" });
    expect(message).not.toContain("invalid-argument");
    expect(message).toMatch(/tải lại trang|phiên/i);
    expect(message).toMatch(/nội dung/i);
  });

  // Fix round 1 (Finding 2, coordinator): chỉ trấn an "đã lưu" khi callable gắn
  // details.reason = "saved" (đúng ba throw site tường minh, tất cả SAU khi tin học sinh đã
  // ghi). internal KHÔNG có marker này (onCall tự bọc một exception SỚM HƠN, trước khi tin
  // được lưu) không được phép khẳng định đã lưu.
  describe("internal — chỉ trấn an 'đã lưu' khi callable xác nhận qua details.reason", () => {
    it("details.reason = 'saved' → trấn an tin nhắn đã được lưu", async () => {
      const message = await captureMessage({
        code: "functions/internal",
        details: { reason: "saved" },
      });
      expect(message).toContain("lưu");
      expect(message).not.toContain("internal");
    });

    it("thiếu details (onCall tự bọc exception SỚM HƠN, trước khi tin được lưu) → thông điệp trung tính, KHÔNG khẳng định đã lưu", async () => {
      const message = await captureMessage({ code: "functions/internal" });
      expect(message).not.toContain("lưu");
      expect(message).not.toContain("internal");
      expect(message.length).toBeGreaterThan(0);
    });
  });

  it("mã lỗi khác (vd not-found, unauthenticated) rơi vào thông điệp chung, không phơi mã hay tiếng Anh", async () => {
    const message = await captureMessage({ code: "functions/not-found" });
    expect(message).not.toContain("not-found");
  });

  it("lỗi không có shape callable (vd network Error thô) vẫn ra thông điệp tiếng Việt an toàn", async () => {
    const message = await captureMessage(new Error("Failed to fetch"));
    expect(message).not.toContain("Failed to fetch");
    expect(message.length).toBeGreaterThan(0);
  });
});

describe("listMessages", () => {
  it("gọi ensureAuthReady TRƯỚC khi đọc", async () => {
    await listMessages("u1", "s1");
    expect(ensureAuthReady.mock.invocationCallOrder[0]).toBeLessThan(
      getDocsMock.mock.invocationCallOrder[0]!,
    );
  });

  it("map từng trường tường minh — Object.keys(result).sort() khớp danh sách mong đợi (chốt chặn chống spread)", async () => {
    getDocsMock.mockResolvedValue({ docs: [makeMessageDoc()] });
    const [result] = await listMessages("u1", "s1");
    expect(Object.keys(result!).sort()).toEqual(
      ["createdAt", "id", "isCrisisResponse", "role", "sessionId", "text", "userId"].sort(),
    );
  });

  it("createdAt là Timestamp thật → chuyển thành Date", async () => {
    const at = new Date("2026-08-24T10:00:00Z");
    getDocsMock.mockResolvedValue({ docs: [makeMessageDoc({ createdAt: new MockTimestamp(at) })] });
    const [result] = await listMessages("u1", "s1");
    expect(result!.createdAt).toBeInstanceOf(Date);
    expect(result!.createdAt!.toISOString()).toBe(at.toISOString());
  });

  it("createdAt KHÔNG phải Timestamp → null, không throw", async () => {
    getDocsMock.mockResolvedValue({ docs: [makeMessageDoc({ createdAt: null })] });
    const [result] = await listMessages("u1", "s1");
    expect(result!.createdAt).toBeNull();
  });

  it("sắp xếp cũ → mới theo createdAt", async () => {
    const older = makeMessageDoc({
      text: "cũ",
      createdAt: new MockTimestamp(new Date("2026-08-01T00:00:00Z")),
    });
    const newer = { ...makeMessageDoc({
      text: "mới",
      createdAt: new MockTimestamp(new Date("2026-08-20T00:00:00Z")),
    }), id: "m2" };
    // Cố ý trả về SAI thứ tự (mới trước) từ getDocs — listMessages phải tự sắp lại.
    getDocsMock.mockResolvedValue({ docs: [newer, older] });
    const result = await listMessages("u1", "s1");
    expect(result.map((r) => r.text)).toEqual(["cũ", "mới"]);
  });

  it("lỗi permission-denied thô từ Firestore không lọt ra ngoài", async () => {
    getDocsMock.mockRejectedValue(RAW_PERMISSION_DENIED);
    const message = await captureThrownMessage(() => listMessages("u1", "s1"));
    expect(message).not.toContain("permission-denied");
    expect(message).not.toContain("Missing or insufficient permissions");
    expect(message.length).toBeGreaterThan(0);
  });
});

describe("listMySessions", () => {
  it("gọi ensureAuthReady TRƯỚC khi đọc", async () => {
    await listMySessions("u1");
    expect(ensureAuthReady.mock.invocationCallOrder[0]).toBeLessThan(
      getDocsMock.mock.invocationCallOrder[0]!,
    );
  });

  it("map từng trường tường minh — Object.keys(result).sort() khớp danh sách mong đợi (chốt chặn chống spread)", async () => {
    getDocsMock.mockResolvedValue({ docs: [makeSessionDoc()] });
    const [result] = await listMySessions("u1");
    expect(Object.keys(result!).sort()).toEqual(
      ["id", "lastMessageAt", "messageCount", "startedAt", "userId"].sort(),
    );
  });

  it("startedAt/lastMessageAt là Timestamp thật → chuyển thành Date", async () => {
    getDocsMock.mockResolvedValue({ docs: [makeSessionDoc()] });
    const [result] = await listMySessions("u1");
    expect(result!.startedAt).toBeInstanceOf(Date);
    expect(result!.lastMessageAt).toBeInstanceOf(Date);
  });

  it("startedAt/lastMessageAt KHÔNG phải Timestamp → null, không throw", async () => {
    getDocsMock.mockResolvedValue({
      docs: [makeSessionDoc({ startedAt: null, lastMessageAt: null })],
    });
    const [result] = await listMySessions("u1");
    expect(result!.startedAt).toBeNull();
    expect(result!.lastMessageAt).toBeNull();
  });

  it("lỗi permission-denied thô từ Firestore không lọt ra ngoài", async () => {
    getDocsMock.mockRejectedValue(RAW_PERMISSION_DENIED);
    const message = await captureThrownMessage(() => listMySessions("u1"));
    expect(message).not.toContain("permission-denied");
    expect(message).not.toContain("Missing or insufficient permissions");
    expect(message.length).toBeGreaterThan(0);
  });
});

describe("deleteMessage", () => {
  it("gọi ensureAuthReady TRƯỚC khi xoá", async () => {
    await deleteMessage("m1");
    expect(ensureAuthReady.mock.invocationCallOrder[0]).toBeLessThan(
      deleteDocMock.mock.invocationCallOrder[0]!,
    );
  });

  it("lỗi permission-denied thô từ Firestore (vd xoá tin của người khác) không lọt ra ngoài", async () => {
    deleteDocMock.mockRejectedValue(RAW_PERMISSION_DENIED);
    const message = await captureThrownMessage(() => deleteMessage("m1"));
    expect(message).not.toContain("permission-denied");
    expect(message).not.toContain("Missing or insufficient permissions");
    expect(message.length).toBeGreaterThan(0);
  });
});

describe("deleteSession", () => {
  it("gọi ensureAuthReady TRƯỚC khi đọc danh sách tin nhắn cần xoá", async () => {
    await deleteSession("u1", "s1");
    expect(ensureAuthReady.mock.invocationCallOrder[0]).toBeLessThan(
      getDocsMock.mock.invocationCallOrder[0]!,
    );
  });

  it("không có tin nhắn nào → vẫn xoá document phiên trong đúng MỘT batch", async () => {
    getDocsMock.mockResolvedValue({ docs: [] });
    await deleteSession("u1", "s1");
    expect(writeBatchMock).toHaveBeenCalledTimes(1);
    expect(batchDeleteMock).toHaveBeenCalledTimes(1);
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
  });

  it("xoá cả session lẫn tin nhắn trong MỘT batch khi tổng thao tác <= 500 (499 tin + 1 session = 500)", async () => {
    const docs = Array.from({ length: 499 }, (_, i) => makeMessageDoc({ text: `t${i}` }));
    getDocsMock.mockResolvedValue({ docs });
    await deleteSession("u1", "s1");
    expect(writeBatchMock).toHaveBeenCalledTimes(1);
    expect(batchDeleteMock).toHaveBeenCalledTimes(500);
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
  });

  // Trần cứng writeBatch() là 500 thao tác — cùng lý do ai-outputs.ts::deleteAllMyOutputs,
  // nhưng ở đây trần tính trên TỔNG (tin nhắn + document phiên), không chỉ riêng tin nhắn:
  // 500 tin nhắn + 1 document phiên = 501 thao tác, vượt trần bằng đúng 1.
  it("chia thành NHIỀU batch khi tổng thao tác > 500 (500 tin + 1 session = 501)", async () => {
    const docs = Array.from({ length: 500 }, (_, i) => makeMessageDoc({ text: `t${i}` }));
    getDocsMock.mockResolvedValue({ docs });
    await deleteSession("u1", "s1");
    expect(writeBatchMock).toHaveBeenCalledTimes(2);
    expect(batchCommitMock).toHaveBeenCalledTimes(2);
    expect(batchDeleteMock).toHaveBeenCalledTimes(501);
  });

  it("501 tin nhắn (+1 session = 502 thao tác) chia đúng 500 + 2", async () => {
    const docs = Array.from({ length: 501 }, (_, i) => makeMessageDoc({ text: `t${i}` }));
    getDocsMock.mockResolvedValue({ docs });
    await deleteSession("u1", "s1");
    expect(writeBatchMock).toHaveBeenCalledTimes(2);
    expect(batchDeleteMock).toHaveBeenCalledTimes(502);
  });

  it("lỗi permission-denied thô từ Firestore ở bước đọc tin nhắn không lọt ra ngoài", async () => {
    getDocsMock.mockRejectedValue(RAW_PERMISSION_DENIED);
    const message = await captureThrownMessage(() => deleteSession("u1", "s1"));
    expect(message).not.toContain("permission-denied");
    expect(message).not.toContain("Missing or insufficient permissions");
    expect(message.length).toBeGreaterThan(0);
  });

  // Fix round 1 (Finding 1, coordinator) — trigger cụ thể: batch là ATOMIC, nên khi document
  // phiên trong chunk KHÔNG thuộc về `uid`, rule từ chối CẢ batch (kể cả khi phần tin nhắn
  // đã được lọc đúng bằng where("userId"...) và getDocs() thành công bình thường). Lỗi thô
  // vẫn có thể lọt ra từ batch.commit(), không chỉ từ getDocs().
  it("lỗi permission-denied thô từ batch.commit() (session không thuộc về uid, batch atomic từ chối cả lô dù phần tin nhắn đã lọc đúng) không lọt ra ngoài", async () => {
    getDocsMock.mockResolvedValue({ docs: [makeMessageDoc()] });
    batchCommitMock.mockRejectedValue(RAW_PERMISSION_DENIED);
    const message = await captureThrownMessage(() => deleteSession("u1", "s1"));
    expect(message).not.toContain("permission-denied");
    expect(message).not.toContain("Missing or insufficient permissions");
    expect(message.length).toBeGreaterThan(0);
  });
});

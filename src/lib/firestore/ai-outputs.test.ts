import { describe, expect, it, vi, beforeEach } from "vitest";

const ensureAuthReady = vi.fn(async () => {});
const getDocsMock = vi.fn(async () => ({ docs: [] as unknown[] }));
const updateDocMock = vi.fn<(ref: unknown, data: unknown) => Promise<void>>(async () => {});
const deleteDocMock = vi.fn<(ref: unknown) => Promise<void>>(async () => {});
const batchDeleteMock = vi.fn();
const batchCommitMock = vi.fn<() => Promise<void>>(async () => {});
const writeBatchMock = vi.fn(() => ({ delete: batchDeleteMock, commit: batchCommitMock }));
const callGenerateReflectionMock = vi.fn<(moodLogId: string) => Promise<{ outputId: string }>>(
  async () => ({ outputId: "out1" }),
);

vi.mock("@/lib/firebase/client", () => ({
  getDb: () => ({}),
  ensureAuthReady,
}));

vi.mock("@/lib/firebase/functions-client", () => ({
  callGenerateReflection: callGenerateReflectionMock,
}));

// Timestamp giả lập — phải là class thật để `instanceof` trong ai-outputs.ts
// nhận ra, giống hệt cách firebase/firestore thật hoạt động.
class MockTimestamp {
  constructor(private readonly date: Date) {}
  toDate(): Date {
    return this.date;
  }
}

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: (...args: unknown[]) => ({ id: String(args.at(-1)) }),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  getDocs: getDocsMock,
  updateDoc: updateDocMock,
  deleteDoc: deleteDocMock,
  writeBatch: writeBatchMock,
  Timestamp: MockTimestamp,
}));

const {
  requestReflection,
  getOutputForMoodLog,
  listMyOutputs,
  setOutputFeedback,
  deleteOutput,
  deleteAllMyOutputs,
} = await import("@/lib/firestore/ai-outputs");

// Bản ghi Firestore giả đầy đủ khớp aiJournalOutputSchema (src/lib/types/ai.ts)
// — dùng chung cho các test mapping để không lệch field.
function makeDoc(overrides: Record<string, unknown> = {}) {
  const data = {
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
    createdAt: new MockTimestamp(new Date("2026-08-24T00:00:00Z")),
    // Trường KHÔNG có trong AiJournalOutputRecord/aiJournalOutputSchema — cố ý để đây
    // (Fix round 1, Finding 4). Nếu mapAiOutputDoc quay lại `{...data, id: d.id}`, trường
    // này sẽ lọt vào kết quả và làm Object.keys(result).sort() lệch danh sách mong đợi bên
    // dưới — nếu không có nó, fixture chỉ có đúng 12 field mô hình hoá nên spread tạo ra
    // CÙNG một bộ khoá và guard không bắt được gì (guard xanh giả).
    internalDebugNote: "không thuộc schema — mô phỏng field lạ trong document thật",
    ...overrides,
  };
  return {
    id: "o1",
    ref: { id: "o1" },
    data: () => data,
  };
}

beforeEach(() => {
  ensureAuthReady.mockClear();
  getDocsMock.mockClear();
  getDocsMock.mockResolvedValue({ docs: [] });
  updateDocMock.mockClear();
  deleteDocMock.mockClear();
  batchDeleteMock.mockClear();
  batchCommitMock.mockClear();
  writeBatchMock.mockClear();
  callGenerateReflectionMock.mockClear();
  callGenerateReflectionMock.mockResolvedValue({ outputId: "out1" });
});

describe("requestReflection", () => {
  it("gọi ensureAuthReady TRƯỚC khi gọi callable", async () => {
    await requestReflection("m1");
    expect(ensureAuthReady.mock.invocationCallOrder[0]).toBeLessThan(
      callGenerateReflectionMock.mock.invocationCallOrder[0]!,
    );
  });

  it("truyền đúng moodLogId và trả về nguyên kết quả khi thành công", async () => {
    const result = await requestReflection("m42");
    expect(callGenerateReflectionMock).toHaveBeenCalledWith("m42");
    expect(result).toEqual({ outputId: "out1" });
  });

  async function captureMessage(rejection: unknown): Promise<string> {
    callGenerateReflectionMock.mockRejectedValue(rejection);
    try {
      await requestReflection("m1");
      throw new Error("requestReflection lẽ ra phải throw nhưng không throw");
    } catch (err) {
      return (err as Error).message;
    }
  }

  it("resource-exhausted: thông điệp đúng nội dung 'hết lượt hôm nay', KHÔNG chứa từ 'lỗi', không phải mã thô", async () => {
    // Fix round 1, Finding 2: bản gốc chỉ assert absence — một bug rơi về nhánh default
    // ("Không thể thực hiện thao tác này...") vẫn KHÔNG chứa "lỗi" hay "resource-exhausted"
    // nên test vẫn xanh dù mất đúng câu brief yêu cầu. Assertion dương ở dưới bắt được điều đó.
    const message = await captureMessage({ code: "functions/resource-exhausted" });
    expect(message).toContain("hết lượt phản chiếu AI");
    expect(message).toContain("hôm nay");
    expect(message).not.toContain("lỗi");
    expect(message).not.toContain("resource-exhausted");
  });

  it("failed-precondition: thông điệp trung tính, không phơi mã lỗi thô", async () => {
    const message = await captureMessage({ code: "functions/failed-precondition" });
    expect(message).not.toContain("failed-precondition");
    expect(message).toMatch(/chưa sẵn sàng|đang tắt/);
  });

  describe("permission-denied — ba nguyên nhân server gộp vào một mã (Fix round 1, Finding 1)", () => {
    it("details.reason = email_unverified → nhắc xác thực email, không nhắc cài đặt", async () => {
      const message = await captureMessage({
        code: "functions/permission-denied",
        details: { reason: "email_unverified" },
      });
      expect(message).toMatch(/xác thực email/);
      expect(message).not.toContain("permission-denied");
      expect(message).not.toContain("email_unverified");
    });

    it("details.reason = ai_opt_in → trỏ tới Cài đặt riêng tư, không trách học sinh", async () => {
      const message = await captureMessage({
        code: "functions/permission-denied",
        details: { reason: "ai_opt_in" },
      });
      expect(message).toMatch(/cài đặt|Cài đặt/);
      expect(message).not.toContain("permission-denied");
      expect(message).not.toContain("ai_opt_in");
    });

    it("không có details (vd mood log không thuộc về mình) → thông điệp trung tính, KHÔNG nhắc cài đặt hay email — không được xác nhận dữ liệu tồn tại", async () => {
      const message = await captureMessage({ code: "functions/permission-denied" });
      expect(message).not.toMatch(/cài đặt|Cài đặt/);
      expect(message).not.toMatch(/xác thực email/);
      expect(message).not.toContain("permission-denied");
    });

    it("details.reason lạ/không nhận diện được → rơi về nhánh trung tính, không throw runtime", async () => {
      const message = await captureMessage({
        code: "functions/permission-denied",
        details: { reason: "something-unexpected" },
      });
      expect(message).not.toMatch(/cài đặt|Cài đặt/);
      expect(message).not.toContain("something-unexpected");
    });
  });

  it("internal: trấn an rằng nhật ký đã được lưu", async () => {
    const message = await captureMessage({ code: "functions/internal" });
    expect(message).toContain("lưu");
    expect(message).not.toContain("internal");
  });

  it("mã lỗi khác (vd unauthenticated) rơi vào thông điệp chung, không phơi mã hay tiếng Anh", async () => {
    const message = await captureMessage({ code: "functions/unauthenticated" });
    expect(message).not.toContain("unauthenticated");
  });

  it("lỗi không có shape callable (vd network Error thô) vẫn ra thông điệp tiếng Việt an toàn, đúng nội dung của nhánh mặc định", async () => {
    // Fix round 1, Finding 3: bản gốc chỉ assert absence — một bug trả về chuỗi rỗng ("")
    // cũng không chứa "Failed to fetch" nên test vẫn xanh. Assertion dương ở dưới bắt được điều đó.
    const message = await captureMessage(new Error("Failed to fetch"));
    expect(message).toBe("Không thể thực hiện thao tác này lúc này, thử lại sau nhé.");
    expect(message).not.toContain("Failed to fetch");
  });
});

describe("getOutputForMoodLog", () => {
  it("gọi ensureAuthReady TRƯỚC khi đọc", async () => {
    await getOutputForMoodLog("u1", "m1");
    expect(ensureAuthReady.mock.invocationCallOrder[0]).toBeLessThan(
      getDocsMock.mock.invocationCallOrder[0]!,
    );
  });

  it("trả về null khi không có output nào", async () => {
    getDocsMock.mockResolvedValue({ docs: [] });
    const result = await getOutputForMoodLog("u1", "m1");
    expect(result).toBeNull();
  });

  it("map từng trường tường minh — Object.keys(result).sort() khớp danh sách mong đợi (chốt chặn chống spread)", async () => {
    getDocsMock.mockResolvedValue({ docs: [makeDoc()] });
    const result = await getOutputForMoodLog("u1", "m1");
    expect(Object.keys(result!).sort()).toEqual(
      [
        "catStoryText",
        "createdAt",
        "id",
        "journalPrompt",
        "model",
        "moodLogId",
        "promptTemplateId",
        "promptVersion",
        "providerLabel",
        "reflectionText",
        "userFeedback",
        "userId",
      ].sort(),
    );
  });

  it("createdAt là Timestamp thật → chuyển thành Date", async () => {
    const at = new Date("2026-08-24T10:00:00Z");
    getDocsMock.mockResolvedValue({ docs: [makeDoc({ createdAt: new MockTimestamp(at) })] });
    const result = await getOutputForMoodLog("u1", "m1");
    expect(result!.createdAt).toBeInstanceOf(Date);
    expect(result!.createdAt!.toISOString()).toBe(at.toISOString());
  });

  it("createdAt KHÔNG phải Timestamp (vd đang chờ server, hoặc thiếu) → null, không throw", async () => {
    getDocsMock.mockResolvedValue({ docs: [makeDoc({ createdAt: null })] });
    const result = await getOutputForMoodLog("u1", "m1");
    expect(result!.createdAt).toBeNull();
  });

  it("nhiều bản ghi khớp cùng moodLogId → chọn bản mới nhất theo createdAt", async () => {
    const older = makeDoc({
      moodLogId: "m1",
      reflectionText: "cũ",
      createdAt: new MockTimestamp(new Date("2026-08-01T00:00:00Z")),
    });
    const newer = {
      ...makeDoc({
        moodLogId: "m1",
        reflectionText: "mới",
        createdAt: new MockTimestamp(new Date("2026-08-20T00:00:00Z")),
      }),
      id: "o2",
    };
    getDocsMock.mockResolvedValue({ docs: [older, newer] });
    const result = await getOutputForMoodLog("u1", "m1");
    expect(result!.reflectionText).toBe("mới");
  });
});

describe("listMyOutputs", () => {
  it("gọi ensureAuthReady TRƯỚC khi đọc", async () => {
    await listMyOutputs("u1");
    expect(ensureAuthReady.mock.invocationCallOrder[0]).toBeLessThan(
      getDocsMock.mock.invocationCallOrder[0]!,
    );
  });

  it("map từng trường tường minh, không spread — Object.keys() khớp danh sách mong đợi", async () => {
    getDocsMock.mockResolvedValue({ docs: [makeDoc()] });
    const [result] = await listMyOutputs("u1");
    expect(Object.keys(result!).sort()).toEqual(
      [
        "catStoryText",
        "createdAt",
        "id",
        "journalPrompt",
        "model",
        "moodLogId",
        "promptTemplateId",
        "promptVersion",
        "providerLabel",
        "reflectionText",
        "userFeedback",
        "userId",
      ].sort(),
    );
  });

  it("sắp xếp mới nhất trước", async () => {
    const older = makeDoc({
      reflectionText: "cũ",
      createdAt: new MockTimestamp(new Date("2026-08-01T00:00:00Z")),
    });
    const newer = { ...makeDoc({
      reflectionText: "mới",
      createdAt: new MockTimestamp(new Date("2026-08-20T00:00:00Z")),
    }), id: "o2" };
    getDocsMock.mockResolvedValue({ docs: [older, newer] });
    const result = await listMyOutputs("u1");
    expect(result.map((r) => r.reflectionText)).toEqual(["mới", "cũ"]);
  });
});

describe("setOutputFeedback", () => {
  it("gọi ensureAuthReady TRƯỚC khi ghi", async () => {
    await setOutputFeedback("o1", "helpful");
    expect(ensureAuthReady.mock.invocationCallOrder[0]).toBeLessThan(
      updateDocMock.mock.invocationCallOrder[0]!,
    );
  });

  it("chỉ ghi đúng trường userFeedback", async () => {
    await setOutputFeedback("o1", "helpful");
    const written = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(written)).toEqual(["userFeedback"]);
    expect(written.userFeedback).toBe("helpful");
  });

  it("chấp nhận null để rút lại đánh giá, ghi null TƯỜNG MINH (không deleteField)", async () => {
    await setOutputFeedback("o1", null);
    const written = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(written)).toEqual(["userFeedback"]);
    expect(written.userFeedback).toBeNull();
    // deleteField() trả về một sentinel object đặc biệt — null tường minh
    // phải là giá trị JS null thật, không phải instance nào khác.
    expect(written.userFeedback === null).toBe(true);
  });
});

describe("deleteOutput", () => {
  it("gọi ensureAuthReady TRƯỚC khi xoá", async () => {
    await deleteOutput("o1");
    expect(ensureAuthReady.mock.invocationCallOrder[0]).toBeLessThan(
      deleteDocMock.mock.invocationCallOrder[0]!,
    );
  });
});

describe("deleteAllMyOutputs", () => {
  it("gọi ensureAuthReady TRƯỚC khi đọc danh sách cần xoá", async () => {
    await deleteAllMyOutputs("u1");
    expect(ensureAuthReady.mock.invocationCallOrder[0]).toBeLessThan(
      getDocsMock.mock.invocationCallOrder[0]!,
    );
  });

  it("trả về 0 khi không có gì để xoá, không tạo batch nào", async () => {
    getDocsMock.mockResolvedValue({ docs: [] });
    const count = await deleteAllMyOutputs("u1");
    expect(count).toBe(0);
    expect(writeBatchMock).not.toHaveBeenCalled();
  });

  it("xoá hết trong MỘT batch khi <= 500 document, trả về đúng số lượng", async () => {
    const docs = Array.from({ length: 500 }, (_, i) => makeDoc({ moodLogId: `m${i}` }));
    getDocsMock.mockResolvedValue({ docs });
    const count = await deleteAllMyOutputs("u1");
    expect(count).toBe(500);
    expect(writeBatchMock).toHaveBeenCalledTimes(1);
    expect(batchDeleteMock).toHaveBeenCalledTimes(500);
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
  });

  it("chia thành NHIỀU batch khi > 500 document (trần cứng của Firestore), trả về tổng đúng", async () => {
    const docs = Array.from({ length: 501 }, (_, i) => makeDoc({ moodLogId: `m${i}` }));
    getDocsMock.mockResolvedValue({ docs });
    const count = await deleteAllMyOutputs("u1");
    expect(count).toBe(501);
    expect(writeBatchMock).toHaveBeenCalledTimes(2);
    expect(batchCommitMock).toHaveBeenCalledTimes(2);
    expect(batchDeleteMock).toHaveBeenCalledTimes(501);
  });
});

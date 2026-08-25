import { describe, it, expect, vi, beforeEach } from "vitest";
import { addDoc, getDoc, getDocs, orderBy, Timestamp, updateDoc } from "firebase/firestore";
import { ensureAuthReady } from "@/lib/firebase/client";
import { callSaveAiConfig } from "@/lib/firebase/functions-client";
import { DEFAULT_AI_CONFIG, type AiConfig } from "@/lib/types/ai";
import {
  getAiConfig, saveAiConfig, isAiEnabled,
  listPromptTemplates, saveDraftPromptTemplate, publishPromptTemplate, unpublishPromptTemplate,
  EDIT_PUBLISHED_TEMPLATE_ERROR,
} from "./admin-ai";

// Mock đúng tại ranh giới mà admin-ai.ts phụ thuộc vào — cùng phong cách admin-resources.test.ts.
vi.mock("@/lib/firebase/client", () => ({
  getDb: vi.fn(() => ({})),
  ensureAuthReady: vi.fn().mockResolvedValue(undefined),
}));

// I4+I5 (final whole-branch review): saveAiConfig() giờ gọi Cloud Function saveAiConfig thay
// vì ghi thẳng writeBatch — mock đúng ranh giới mới, cùng phong cách callDeleteUserData/
// callSetUserRole ở các file test khác dùng functions-client.ts.
vi.mock("@/lib/firebase/functions-client", () => ({
  callSaveAiConfig: vi.fn().mockResolvedValue({ ok: true }),
}));

const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((..._args: unknown[]) => ({ id: "mock-doc" })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn(),
  orderBy: vi.fn((...args: unknown[]) => ["ORDER_BY", ...args]),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TS"),
  Timestamp: class {
    constructor(private readonly d: Date) {}
    toDate() {
      return this.d;
    }
  },
  writeBatch: vi.fn(() => ({
    set: mockBatchSet,
    update: mockBatchUpdate,
    commit: mockBatchCommit,
  })),
}));

const mockedGetDoc = vi.mocked(getDoc);
const mockedGetDocs = vi.mocked(getDocs);
const mockedUpdateDoc = vi.mocked(updateDoc);
const mockedAddDoc = vi.mocked(addDoc);

function fakeDocSnap(data: Record<string, unknown> | undefined) {
  return { data: () => data } as unknown as Awaited<ReturnType<typeof getDoc>>;
}

function fakeQuerySnap(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    docs: docs.map((d) => ({ id: d.id, data: () => d.data, ref: { id: d.id } })),
  } as unknown as Awaited<ReturnType<typeof getDocs>>;
}

/** Constructor mock (1 tham số) khác chữ ký thật của Timestamp (seconds, nanoseconds) —
 *  đủ cho instanceof/toDate() mà admin-ai.ts thực sự dùng. Cùng cách làm với onboarding.test.ts. */
function fakeTimestamp(d: Date): Timestamp {
  return new (Timestamp as unknown as new (d: Date) => Timestamp)(d);
}

const VALID_CONFIG: AiConfig = {
  providerLabel: "OpenAI",
  baseUrl: "https://api.example.com/v1",
  model: "gpt-4o-mini",
  temperature: 0.7,
  maxTokens: 500,
  quotaStudentPerDay: 10,
  chatQuotaPerDay: 30,
  rateLimitPerMinute: 3,
  chatRateLimitPerMinute: 20,
  killSwitch: { moodReflection: false, chat: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBatchCommit.mockResolvedValue(undefined);
});

describe("getAiConfig", () => {
  it("gọi ensureAuthReady TRƯỚC getDoc — đóng race lúc mới đăng nhập", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedGetDoc.mockImplementation(async () => {
      order.push("getDoc");
      return fakeDocSnap(undefined);
    });

    await getAiConfig();

    expect(order).toEqual(["ensureAuthReady", "getDoc"]);
  });

  it("document chưa tồn tại -> trả về DEFAULT_AI_CONFIG", async () => {
    mockedGetDoc.mockResolvedValue(fakeDocSnap(undefined));
    expect(await getAiConfig()).toEqual(DEFAULT_AI_CONFIG);
  });

  it("document sai hình dạng (vd temperature ngoài khoảng) -> trả về DEFAULT_AI_CONFIG, KHÔNG throw", async () => {
    mockedGetDoc.mockResolvedValue(fakeDocSnap({ ...VALID_CONFIG, temperature: 5 }));
    expect(await getAiConfig()).toEqual(DEFAULT_AI_CONFIG);
  });

  it("document hợp lệ -> trả về đúng giá trị đã lưu", async () => {
    mockedGetDoc.mockResolvedValue(fakeDocSnap(VALID_CONFIG));
    expect(await getAiConfig()).toEqual(VALID_CONFIG);
  });
});

describe("isAiEnabled", () => {
  it("true khi baseUrl, model khác rỗng, killSwitch tắt và quotaStudentPerDay > 0", () => {
    expect(
      isAiEnabled({
        baseUrl: "https://a.test", model: "m",
        killSwitch: { moodReflection: false, chat: true }, quotaStudentPerDay: 5, chatQuotaPerDay: 0,
      }),
    ).toBe(true);
  });

  it("false khi baseUrl rỗng", () => {
    expect(
      isAiEnabled({
        baseUrl: "", model: "m", killSwitch: { moodReflection: false, chat: true },
        quotaStudentPerDay: 5, chatQuotaPerDay: 0,
      }),
    ).toBe(false);
  });

  it("false khi model rỗng", () => {
    expect(
      isAiEnabled({
        baseUrl: "https://a.test", model: "", killSwitch: { moodReflection: false, chat: true },
        quotaStudentPerDay: 5, chatQuotaPerDay: 0,
      }),
    ).toBe(false);
  });

  it("false khi killSwitch đang bật cả hai (true = tính năng TẮT)", () => {
    expect(
      isAiEnabled({
        baseUrl: "https://a.test", model: "m", killSwitch: { moodReflection: true, chat: true },
        quotaStudentPerDay: 5, chatQuotaPerDay: 30,
      }),
    ).toBe(false);
  });

  // M8 (final whole-branch review): trước fix, isAiEnabled bỏ qua quotaStudentPerDay — với
  // quota ở giá trị mặc định khi ship (0, nghĩa là "KHÔNG lượt nào" — xem aiConfigSchema),
  // baseUrl/model đã điền và kill switch tắt sẽ khiến aiPublic.enabled=true, màn hình đồng ý
  // mời học sinh bật, và MỌI lượt gọi đều bị resource-exhausted ngay lập tức — hiện ra như
  // "Bạn đã dùng hết lượt phản chiếu AI cho hôm nay rồi" cho một học sinh chưa dùng lượt nào.
  it("M8: false khi quotaStudentPerDay=0 VÀ chatQuotaPerDay=0, dù baseUrl/model/killSwitch đều hợp lệ", () => {
    expect(
      isAiEnabled({
        baseUrl: "https://a.test", model: "m",
        killSwitch: { moodReflection: false, chat: true }, quotaStudentPerDay: 0, chatQuotaPerDay: 0,
      }),
    ).toBe(false);
  });

  it("M8: true khi quotaStudentPerDay > 0 cộng các điều kiện còn lại", () => {
    expect(
      isAiEnabled({
        baseUrl: "https://a.test", model: "m",
        killSwitch: { moodReflection: false, chat: true }, quotaStudentPerDay: 5, chatQuotaPerDay: 0,
      }),
    ).toBe(true);
  });

  // Task 9 (task-9-brief.md — lý do đầy đủ ở task-9-report.md): giờ có HAI tính năng, mỗi tính
  // năng có killSwitch + quota riêng — `enabled` là OR giữa hai tính năng, không phải AND, vì
  // cùng một ô tick aiOptIn gate cả hai (xem cùng comment ở functions/src/ai/config.ts).
  it("QUYẾT ĐỊNH MỚI: chỉ chat sẵn sàng (phản chiếu tắt) -> true", () => {
    expect(
      isAiEnabled({
        baseUrl: "https://a.test", model: "m",
        killSwitch: { moodReflection: true, chat: false }, quotaStudentPerDay: 0, chatQuotaPerDay: 30,
      }),
    ).toBe(true);
  });

  it("chat killSwitch tắt (đang bật) nhưng chatQuotaPerDay=0 -> chat KHÔNG sẵn sàng; phản chiếu cũng tắt -> false", () => {
    expect(
      isAiEnabled({
        baseUrl: "https://a.test", model: "m",
        killSwitch: { moodReflection: true, chat: false }, quotaStudentPerDay: 0, chatQuotaPerDay: 0,
      }),
    ).toBe(false);
  });
});

// I4+I5 (final whole-branch review): saveAiConfig() giờ chỉ là một lớp mỏng gọi Cloud Function
// saveAiConfig (functions/src/admin/saveAiConfig.ts) — nơi THẬT SỰ ghi ATOMIC hai document và
// audit log giờ nằm ở functions/src/admin/saveAiConfig.test.ts (chạy trên Firestore emulator).
// Test ở đây chỉ còn xác nhận admin-ai.ts gọi đúng callable với đúng dữ liệu.
describe("saveAiConfig", () => {
  const mockedCallSaveAiConfig = vi.mocked(callSaveAiConfig);

  it("gọi callSaveAiConfig với đúng config", async () => {
    await saveAiConfig(VALID_CONFIG);

    expect(mockedCallSaveAiConfig).toHaveBeenCalledWith(VALID_CONFIG);
  });
});

describe("listPromptTemplates", () => {
  it("gọi ensureAuthReady TRƯỚC getDocs", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedGetDocs.mockImplementation(async () => {
      order.push("getDocs");
      return fakeQuerySnap([]);
    });

    await listPromptTemplates();

    expect(order).toEqual(["ensureAuthReady", "getDocs"]);
  });

  it("chuyển Timestamp updatedAt thành Date", async () => {
    const at = new Date("2026-08-20T00:00:00Z");
    mockedGetDocs.mockResolvedValue(
      fakeQuerySnap([{
        id: "pt1",
        data: {
          name: "mood_reflection", version: 1, status: "draft",
          systemPrompt: "sp", userTemplate: "ut", updatedBy: "admin-1",
          updatedAt: fakeTimestamp(at),
        },
      }]),
    );

    const result = await listPromptTemplates();
    expect(result[0]?.updatedAt).toEqual(at);
  });

  // Fix round 1, Finding 7: trước đây không có orderBy, Firestore trả về theo thứ tự auto-ID —
  // v3 có thể hiện dưới v1 trong danh sách admin bấm "Đăng" từ đó.
  it("sắp theo version giảm dần — gọi orderBy('version', 'desc')", async () => {
    mockedGetDocs.mockResolvedValue(fakeQuerySnap([]));

    await listPromptTemplates();

    expect(vi.mocked(orderBy)).toHaveBeenCalledWith("version", "desc");
  });

  // Fix round 1, Finding 6: document lệch hình dạng (field thiếu/sai kiểu) không được làm
  // name/version trở thành undefined — rơi vào where("name","==",undefined) ở
  // publishPromptTemplate() hay value={undefined} trên textarea của AiConfigEditor.tsx.
  it("document lệch hình dạng -> fallback an toàn, KHÔNG undefined", async () => {
    mockedGetDocs.mockResolvedValue(
      fakeQuerySnap([{
        id: "pt-bad",
        data: { version: "not-a-number", status: "linh-tinh" },
      }]),
    );

    const result = await listPromptTemplates();

    expect(result[0]).toMatchObject({
      id: "pt-bad", name: "", version: 1, status: "draft",
      systemPrompt: "", userTemplate: "", updatedBy: "",
    });
    expect(result[0]?.name).not.toBeUndefined();
    expect(result[0]?.version).not.toBeUndefined();
  });
});

describe("saveDraftPromptTemplate", () => {
  it("tạo mới -> status luôn là draft", async () => {
    mockedAddDoc.mockResolvedValue({ id: "new-id" } as never);

    const id = await saveDraftPromptTemplate(
      null,
      { name: "mood_reflection", version: 1, systemPrompt: "sp", userTemplate: "ut" },
      "admin-1",
    );

    expect(id).toBe("new-id");
    const payload = mockedAddDoc.mock.calls[0]?.[1] as { status?: string };
    expect(payload.status).toBe("draft");
  });

  it("sửa bản đang DRAFT -> gọi updateDoc, KHÔNG đổi status", async () => {
    mockedGetDoc.mockResolvedValue(fakeDocSnap({ status: "draft" }));

    await saveDraftPromptTemplate(
      "pt1",
      { name: "mood_reflection", version: 2, systemPrompt: "sp2", userTemplate: "ut2" },
      "admin-1",
    );

    expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
    const payload = mockedUpdateDoc.mock.calls[0]?.[1] as unknown as Record<string, unknown>;
    expect(payload.status).toBeUndefined();
    expect(payload.name).toBe("mood_reflection");
  });

  // Fix round 1, Finding 5 (ruling của reviewer): sửa trực tiếp một bản ĐANG PUBLISHED phải bị
  // chặn — prompt này gửi kèm bài viết cảm xúc riêng tư của học sinh, đổi nội dung mà không qua
  // bước gỡ đăng (và rà soát lại) là né tránh go-live checklist.
  it("sửa một bản ĐANG PUBLISHED -> bị chặn, KHÔNG gọi updateDoc", async () => {
    mockedGetDoc.mockResolvedValue(fakeDocSnap({ status: "published" }));

    await expect(
      saveDraftPromptTemplate(
        "pt1",
        { name: "mood_reflection", version: 2, systemPrompt: "sp2", userTemplate: "ut2" },
        "admin-1",
      ),
    ).rejects.toThrow(EDIT_PUBLISHED_TEMPLATE_ERROR);

    expect(mockedUpdateDoc).not.toHaveBeenCalled();
  });
});

describe("publishPromptTemplate", () => {
  it("publish bản này VÀ gỡ đăng mọi bản KHÁC cùng name trong CÙNG MỘT batch", async () => {
    mockedGetDocs.mockResolvedValue(
      fakeQuerySnap([
        { id: "pt-old", data: { name: "mood_reflection", status: "published" } },
        { id: "pt-new", data: { name: "mood_reflection", status: "draft" } },
      ]),
    );

    await publishPromptTemplate("pt-new", "mood_reflection");

    // pt-old (khác id) bị gỡ đăng, pt-new được publish — cả hai trong 1 batch.commit()
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pt-old" }),
      expect.objectContaining({ status: "draft" }),
    );
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it("không gỡ đăng chính bản đang publish (khi nó đã nằm trong kết quả truy vấn)", async () => {
    mockedGetDocs.mockResolvedValue(
      fakeQuerySnap([{ id: "pt-new", data: { name: "mood_reflection", status: "published" } }]),
    );

    await publishPromptTemplate("pt-new", "mood_reflection");

    const unpublishCalls = mockBatchUpdate.mock.calls.filter(
      (call) => (call[1] as { status?: string }).status === "draft",
    );
    expect(unpublishCalls).toHaveLength(0);
  });
});

describe("unpublishPromptTemplate", () => {
  it("đặt status về draft", async () => {
    await unpublishPromptTemplate("pt1");

    expect(mockedUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "draft" }),
    );
  });
});

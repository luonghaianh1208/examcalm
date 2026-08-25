import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  callDeleteUserData,
  callGenerateReflection,
  callTestAiConnection,
  callSendChatMessage,
} from "./functions-client";
import { ensureAuthReady } from "./client";
import { httpsCallable } from "firebase/functions";

vi.mock("./client", () => ({
  getFirebaseApp: vi.fn(),
  ensureAuthReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(),
  connectFunctionsEmulator: vi.fn(),
}));

const mockedHttpsCallable = vi.mocked(httpsCallable);

// httpsCallable() thật trả về hàm có thêm method `.stream` — mock trong test chỉ
// cần gọi được như hàm, nên ép kiểu về đúng chữ ký httpsCallable() trả về.
function mockCallable(impl: (...args: unknown[]) => Promise<unknown>): ReturnType<typeof httpsCallable> {
  return impl as unknown as ReturnType<typeof httpsCallable>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("callDeleteUserData", () => {
  it("gọi ensureAuthReady TRƯỚC khi gọi callable — đóng race lúc mới đăng nhập", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedHttpsCallable.mockReturnValue(mockCallable(async () => {
      order.push("httpsCallable");
      return { data: { ok: true, deleted: { attempts: 0, moods: 0, favorites: 0 } } };
    }));

    await callDeleteUserData("u1");

    expect(order).toEqual(["ensureAuthReady", "httpsCallable"]);
  });

  it("gọi callable deleteUserData với đúng targetUid và trả về nguyên kết quả", async () => {
    mockedHttpsCallable.mockReturnValue(mockCallable(async (payload) => {
      expect(payload).toEqual({ targetUid: "u9" });
      return { data: { ok: true, deleted: { attempts: 1, moods: 2, favorites: 3 } } };
    }));

    const result = await callDeleteUserData("u9");

    expect(mockedHttpsCallable).toHaveBeenCalledWith(expect.anything(), "deleteUserData");
    expect(result).toEqual({ ok: true, deleted: { attempts: 1, moods: 2, favorites: 3 } });
  });

  it("chuyển tiếp cờ authDeleteFailed khi Firestore đã xóa xong nhưng Auth chưa xóa được", async () => {
    mockedHttpsCallable.mockReturnValue(mockCallable(async () => ({
      data: { ok: true, deleted: { attempts: 1, moods: 1, favorites: 1 }, authDeleteFailed: true },
    })));

    const result = await callDeleteUserData("u1");

    expect(result.authDeleteFailed).toBe(true);
  });
});

describe("callGenerateReflection", () => {
  it("gọi ensureAuthReady TRƯỚC khi gọi callable — đóng race lúc mới đăng nhập", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedHttpsCallable.mockReturnValue(mockCallable(async () => {
      order.push("httpsCallable");
      return { data: { outputId: "out1" } };
    }));

    await callGenerateReflection("m1");

    expect(order).toEqual(["ensureAuthReady", "httpsCallable"]);
  });

  it("gọi callable generateReflection với đúng moodLogId và trả về nguyên kết quả", async () => {
    mockedHttpsCallable.mockReturnValue(mockCallable(async (payload) => {
      expect(payload).toEqual({ moodLogId: "m9" });
      return { data: { outputId: "out9" } };
    }));

    const result = await callGenerateReflection("m9");

    expect(mockedHttpsCallable).toHaveBeenCalledWith(expect.anything(), "generateReflection");
    expect(result).toEqual({ outputId: "out9" });
  });

  it("không nuốt lỗi callable — để nguyên cho caller (ai-outputs.ts) tự dịch sang tiếng Việt", async () => {
    mockedHttpsCallable.mockReturnValue(mockCallable(async () => {
      throw { code: "functions/resource-exhausted" };
    }));

    await expect(callGenerateReflection("m1")).rejects.toEqual({
      code: "functions/resource-exhausted",
    });
  });
});

describe("callTestAiConnection", () => {
  it("gọi ensureAuthReady TRƯỚC khi gọi callable — đóng race lúc mới đăng nhập", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedHttpsCallable.mockReturnValue(mockCallable(async () => {
      order.push("httpsCallable");
      return { data: { ok: true } };
    }));

    await callTestAiConnection();

    expect(order).toEqual(["ensureAuthReady", "httpsCallable"]);
  });

  it("gọi callable testAiConnection và trả về nguyên kết quả thành công", async () => {
    mockedHttpsCallable.mockReturnValue(mockCallable(async () => ({ data: { ok: true } })));

    const result = await callTestAiConnection();

    expect(mockedHttpsCallable).toHaveBeenCalledWith(expect.anything(), "testAiConnection");
    expect(result).toEqual({ ok: true });
  });

  it("chuyển tiếp kết quả thất bại đã được sanitise, không throw", async () => {
    mockedHttpsCallable.mockReturnValue(mockCallable(async () => ({
      data: { ok: false, kind: "auth", message: "Xác thực với AI provider thất bại." },
    })));

    const result = await callTestAiConnection();

    expect(result).toEqual({ ok: false, kind: "auth", message: "Xác thực với AI provider thất bại." });
  });
});

describe("callSendChatMessage", () => {
  it("gọi ensureAuthReady TRƯỚC khi gọi callable — đóng race lúc mới đăng nhập", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedHttpsCallable.mockReturnValue(mockCallable(async () => {
      order.push("httpsCallable");
      return { data: { messageId: "msg1" } };
    }));

    await callSendChatMessage("s1", "Em thấy lo lắng quá");

    expect(order).toEqual(["ensureAuthReady", "httpsCallable"]);
  });

  it("gọi callable sendChatMessage với đúng sessionId/text và trả về nguyên kết quả", async () => {
    mockedHttpsCallable.mockReturnValue(mockCallable(async (payload) => {
      expect(payload).toEqual({ sessionId: "s9", text: "Nội dung" });
      return { data: { messageId: "msg9" } };
    }));

    const result = await callSendChatMessage("s9", "Nội dung");

    expect(mockedHttpsCallable).toHaveBeenCalledWith(expect.anything(), "sendChatMessage");
    expect(result).toEqual({ messageId: "msg9" });
  });

  it("không nuốt lỗi callable — để nguyên cho caller (chat.ts) tự dịch sang tiếng Việt", async () => {
    mockedHttpsCallable.mockReturnValue(mockCallable(async () => {
      throw { code: "functions/resource-exhausted" };
    }));

    await expect(callSendChatMessage("s1", "abc")).rejects.toEqual({
      code: "functions/resource-exhausted",
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDoc, setDoc, Timestamp } from "firebase/firestore";
import { ensureAuthReady } from "@/lib/firebase/client";
import { getOnboarding, markWelcomeSeen, setHideTooltips } from "./onboarding";

vi.mock("@/lib/firebase/client", () => ({
  getDb: vi.fn(() => ({})),
  ensureAuthReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  // Constructor 1 tham số (Date) — khác chữ ký thật của Timestamp (seconds,
  // nanoseconds). Đủ cho instanceof/toDate() mà onboarding.ts thực sự dùng.
  Timestamp: class {
    constructor(private d: Date) {}
    toDate() {
      return this.d;
    }
  },
}));

const mockedGetDoc = vi.mocked(getDoc);
const mockedSetDoc = vi.mocked(setDoc);

function fakeSnap(data: Record<string, unknown> | undefined) {
  return { data: () => data } as unknown as Awaited<ReturnType<typeof getDoc>>;
}

/**
 * Ép kiểu constructor mock (1 tham số) thay vì chữ ký thật của Timestamp (2
 * tham số) — vitest mock module thay hoàn toàn implementation lúc runtime,
 * nhưng TypeScript vẫn type-check lời gọi theo type thật được import.
 */
function fakeTimestamp(d: Date): Timestamp {
  return new (Timestamp as unknown as new (d: Date) => Timestamp)(d);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSetDoc.mockResolvedValue(undefined);
});

describe("getOnboarding", () => {
  it("gọi ensureAuthReady TRƯỚC getDoc — đóng race lúc mới đăng nhập", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedGetDoc.mockImplementation(async () => {
      order.push("getDoc");
      return fakeSnap(undefined);
    });

    await getOnboarding("u1");

    expect(order).toEqual(["ensureAuthReady", "getDoc"]);
  });

  it("hồ sơ chưa có field onboarding (tài khoản cũ) -> mặc định chưa thấy welcome, chưa ẩn tour", async () => {
    mockedGetDoc.mockResolvedValue(fakeSnap(undefined));

    const state = await getOnboarding("u1");

    expect(state).toEqual({ welcomeSeenAt: null, hideTooltips: false });
  });

  it("đọc đúng welcomeSeenAt/hideTooltips đã lưu", async () => {
    const seenAt = fakeTimestamp(new Date("2026-08-20T00:00:00Z"));
    mockedGetDoc.mockResolvedValue(
      fakeSnap({ onboarding: { welcomeSeenAt: seenAt, hideTooltips: true } }),
    );

    const state = await getOnboarding("u1");

    expect(state.hideTooltips).toBe(true);
    expect(state.welcomeSeenAt).toEqual(new Date("2026-08-20T00:00:00Z"));
  });

  it("getDoc lỗi -> trả về mặc định thay vì throw (không được chặn app)", async () => {
    mockedGetDoc.mockRejectedValue(new Error("mất mạng"));

    const state = await getOnboarding("u1");

    expect(state).toEqual({ welcomeSeenAt: null, hideTooltips: false });
  });
});

describe("markWelcomeSeen", () => {
  it("gọi ensureAuthReady TRƯỚC setDoc — đóng race lúc mới đăng nhập", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedSetDoc.mockImplementation(async () => {
      order.push("setDoc");
    });

    await markWelcomeSeen("u1");

    expect(order).toEqual(["ensureAuthReady", "setDoc"]);
  });

  it("chỉ ghi field onboarding.welcomeSeenAt, không đụng tới hideTooltips", async () => {
    await markWelcomeSeen("u1");

    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      { onboarding: { welcomeSeenAt: "SERVER_TIMESTAMP" } },
      { merge: true },
    );
  });

  it("setDoc lỗi -> nuốt lỗi, không throw", async () => {
    mockedSetDoc.mockRejectedValue(new Error("permission-denied"));

    await expect(markWelcomeSeen("u1")).resolves.toBeUndefined();
  });
});

describe("setHideTooltips", () => {
  it("gọi ensureAuthReady TRƯỚC setDoc — đóng race lúc mới đăng nhập", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedSetDoc.mockImplementation(async () => {
      order.push("setDoc");
    });

    await setHideTooltips("u1", true);

    expect(order).toEqual(["ensureAuthReady", "setDoc"]);
  });

  it("ghi đúng field onboarding.hideTooltips", async () => {
    await setHideTooltips("u1", true);

    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      { onboarding: { hideTooltips: true } },
      { merge: true },
    );
  });

  it("setDoc lỗi -> nuốt lỗi, không throw", async () => {
    mockedSetDoc.mockRejectedValue(new Error("permission-denied"));

    await expect(setHideTooltips("u1", false)).resolves.toBeUndefined();
  });
});

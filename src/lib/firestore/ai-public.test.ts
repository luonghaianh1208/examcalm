import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDoc } from "firebase/firestore";
import { ensureAuthReady } from "@/lib/firebase/client";
import { getAiPublicConfig } from "./ai-public";

vi.mock("@/lib/firebase/client", () => ({
  getDb: vi.fn(() => ({})),
  ensureAuthReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
}));

const mockedGetDoc = vi.mocked(getDoc);

function fakeSnap(data: Record<string, unknown> | undefined) {
  return { data: () => data } as unknown as Awaited<ReturnType<typeof getDoc>>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAiPublicConfig", () => {
  it("gọi ensureAuthReady TRƯỚC getDoc — đóng race lúc mới đăng nhập", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedGetDoc.mockImplementation(async () => {
      order.push("getDoc");
      return fakeSnap(undefined);
    });

    await getAiPublicConfig();

    expect(order).toEqual(["ensureAuthReady", "getDoc"]);
  });

  it("document chưa tồn tại (Task 12 chưa ghi) -> chưa khả dụng", async () => {
    mockedGetDoc.mockResolvedValue(fakeSnap(undefined));

    expect(await getAiPublicConfig()).toEqual({ providerLabel: "", enabled: false });
  });

  it("enabled=false dù có providerLabel -> vẫn chưa khả dụng", async () => {
    mockedGetDoc.mockResolvedValue(fakeSnap({ providerLabel: "DeepSeek", enabled: false }));

    expect(await getAiPublicConfig()).toEqual({ providerLabel: "", enabled: false });
  });

  it("providerLabel rỗng dù enabled=true -> vẫn chưa khả dụng", async () => {
    mockedGetDoc.mockResolvedValue(fakeSnap({ providerLabel: "", enabled: true }));

    expect(await getAiPublicConfig()).toEqual({ providerLabel: "", enabled: false });
  });

  it("enabled=true và providerLabel khác rỗng -> trả về đúng, KHÔNG phải chuỗi cứng", async () => {
    mockedGetDoc.mockResolvedValue(fakeSnap({ providerLabel: "DeepSeek", enabled: true }));

    expect(await getAiPublicConfig()).toEqual({ providerLabel: "DeepSeek", enabled: true });
  });

  it("getDoc lỗi -> trả về chưa khả dụng thay vì throw (không chặn màn hình đồng ý)", async () => {
    mockedGetDoc.mockRejectedValue(new Error("mất mạng"));

    await expect(getAiPublicConfig()).resolves.toEqual({ providerLabel: "", enabled: false });
  });
});

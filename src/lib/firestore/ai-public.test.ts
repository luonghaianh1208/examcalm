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

    expect(await getAiPublicConfig()).toEqual({
      providerLabel: "", enabled: false, reflectionEnabled: false, chatEnabled: false,
    });
  });

  it("enabled=false dù có providerLabel -> vẫn chưa khả dụng", async () => {
    mockedGetDoc.mockResolvedValue(
      fakeSnap({ providerLabel: "DeepSeek", enabled: false, reflectionEnabled: false, chatEnabled: false }),
    );

    expect(await getAiPublicConfig()).toEqual({
      providerLabel: "", enabled: false, reflectionEnabled: false, chatEnabled: false,
    });
  });

  it("providerLabel rỗng dù enabled=true -> vẫn chưa khả dụng", async () => {
    mockedGetDoc.mockResolvedValue(
      fakeSnap({ providerLabel: "", enabled: true, reflectionEnabled: true, chatEnabled: false }),
    );

    expect(await getAiPublicConfig()).toEqual({
      providerLabel: "", enabled: false, reflectionEnabled: false, chatEnabled: false,
    });
  });

  it("enabled=true và providerLabel khác rỗng -> trả về đúng, KHÔNG phải chuỗi cứng", async () => {
    mockedGetDoc.mockResolvedValue(
      fakeSnap({ providerLabel: "DeepSeek", enabled: true, reflectionEnabled: true, chatEnabled: false }),
    );

    expect(await getAiPublicConfig()).toEqual({
      providerLabel: "DeepSeek", enabled: true, reflectionEnabled: true, chatEnabled: false,
    });
  });

  it("getDoc lỗi -> trả về chưa khả dụng thay vì throw (không chặn màn hình đồng ý)", async () => {
    mockedGetDoc.mockRejectedValue(new Error("mất mạng"));

    await expect(getAiPublicConfig()).resolves.toEqual({
      providerLabel: "", enabled: false, reflectionEnabled: false, chatEnabled: false,
    });
  });

  // Task 9 fix round 1, Finding 2 (CRITICAL — reviewer): kịch bản §10 — chỉ chat sẵn sàng,
  // phản chiếu tắt. `reflectionEnabled` PHẢI đọc đúng false từ document, KHÔNG được suy ra từ
  // `enabled` (enabled=true ở đây, nhưng reflectionEnabled vẫn phải false).
  it("kịch bản §10: enabled=true (chỉ chat bật) -> reflectionEnabled=false, chatEnabled=true đọc đúng, không suy diễn từ enabled", async () => {
    mockedGetDoc.mockResolvedValue(
      fakeSnap({ providerLabel: "DeepSeek", enabled: true, reflectionEnabled: false, chatEnabled: true }),
    );

    expect(await getAiPublicConfig()).toEqual({
      providerLabel: "DeepSeek", enabled: true, reflectionEnabled: false, chatEnabled: true,
    });
  });

  it("reflectionEnabled/chatEnabled thiếu hoặc sai kiểu trên document -> fallback an toàn về false, KHÔNG throw", async () => {
    mockedGetDoc.mockResolvedValue(
      fakeSnap({ providerLabel: "DeepSeek", enabled: true, reflectionEnabled: "yes" }),
    );

    expect(await getAiPublicConfig()).toEqual({
      providerLabel: "DeepSeek", enabled: true, reflectionEnabled: false, chatEnabled: false,
    });
  });
});

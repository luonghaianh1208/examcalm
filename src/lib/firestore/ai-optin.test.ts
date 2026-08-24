import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDoc } from "firebase/firestore";
import { ensureAuthReady } from "@/lib/firebase/client";
import { getAiOptIn } from "./ai-optin";

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

describe("getAiOptIn", () => {
  it("gọi ensureAuthReady TRƯỚC getDoc — đóng race lúc mới đăng nhập", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedGetDoc.mockImplementation(async () => {
      order.push("getDoc");
      return fakeSnap({ privacySettings: { aiOptIn: true } });
    });

    await getAiOptIn("u1");

    expect(order).toEqual(["ensureAuthReady", "getDoc"]);
  });

  it("privacySettings.aiOptIn=true -> trả về true", async () => {
    mockedGetDoc.mockResolvedValue(fakeSnap({ privacySettings: { aiOptIn: true } }));
    expect(await getAiOptIn("u1")).toBe(true);
  });

  it("privacySettings.aiOptIn=false -> trả về false", async () => {
    mockedGetDoc.mockResolvedValue(fakeSnap({ privacySettings: { aiOptIn: false } }));
    expect(await getAiOptIn("u1")).toBe(false);
  });

  it("document không tồn tại -> trả về false", async () => {
    mockedGetDoc.mockResolvedValue(fakeSnap(undefined));
    expect(await getAiOptIn("u1")).toBe(false);
  });

  it("hồ sơ cũ thiếu privacySettings -> trả về false, không throw", async () => {
    mockedGetDoc.mockResolvedValue(fakeSnap({ uid: "u1" }));
    expect(await getAiOptIn("u1")).toBe(false);
  });

  it("getDoc lỗi -> trả về false thay vì throw (không được chặn hay tự ý gọi callable)", async () => {
    mockedGetDoc.mockRejectedValue(new Error("mất mạng"));
    await expect(getAiOptIn("u1")).resolves.toBe(false);
  });
});

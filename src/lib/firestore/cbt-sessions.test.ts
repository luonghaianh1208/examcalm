import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const ensureAuthReady = vi.fn(async () => {});
const setDocMock = vi.fn(async (_ref: unknown, _data: unknown) => {});

vi.mock("@/lib/firebase/client", () => ({
  getDb: () => ({}),
  ensureAuthReady,
}));

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: () => ({ id: "generated-id", path: "cbtSessions/generated-id" }),
  setDoc: setDocMock,
  getDocs: async () => ({ docs: [] }),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  serverTimestamp: () => "SERVER_TS",
  Timestamp: class {},
}));

const { newSessionRef, saveCbtSession } = await import("@/lib/firestore/cbt-sessions");

beforeEach(() => { ensureAuthReady.mockClear(); setDocMock.mockClear(); });

describe("newSessionRef", () => {
  it("trả về id và path dùng được cho linkedActivityRef", () => {
    const ref = newSessionRef();
    expect(ref.id).toBe("generated-id");
    expect(ref.path).toBe("cbtSessions/generated-id");
  });
});

describe("saveCbtSession", () => {
  const INPUT = { moduleId: "m1", moduleVersion: 1, answers: { s1: "a" }, summary: "" };

  it("gọi ensureAuthReady TRƯỚC khi ghi", async () => {
    await saveCbtSession("u1", "s1", INPUT);
    expect(ensureAuthReady.mock.invocationCallOrder[0]).toBeLessThan(
      setDocMock.mock.invocationCallOrder[0]!,
    );
  });

  it("ghi userId từ tham số, không lấy từ input", async () => {
    await saveCbtSession("u1", "s1", INPUT);
    const written = setDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(written.userId).toBe("u1");
  });

  it("từ chối answers vượt quá giới hạn schema", async () => {
    const bad = { ...INPUT, answers: { s1: "x".repeat(2001) } };
    await expect(saveCbtSession("u1", "s1", bad)).rejects.toThrow();
  });
});

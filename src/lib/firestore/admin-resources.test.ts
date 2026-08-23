import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDocs } from "firebase/firestore";
import { ensureAuthReady } from "@/lib/firebase/client";
import { isSlugTaken, listAllResources } from "./admin-resources";

// Mock đúng tại ranh giới mà admin-resources.ts phụ thuộc vào — gói
// "firebase/firestore" (các hàm rời collection/query/where/getDocs) và
// getDb()/ensureAuthReady() từ client.ts — cùng phong cách queries-public.test.ts
// mock "./admin" (module thật được import), không mock lại file đang test.
vi.mock("@/lib/firebase/client", () => ({
  getDb: vi.fn(() => ({})),
  ensureAuthReady: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

const mockedGetDocs = vi.mocked(getDocs);

/**
 * Fake tối giản của QuerySnapshot — chỉ cần `.docs` với `.id` trên mỗi phần
 * tử, đúng những gì isSlugTaken() thật sự đọc. Ép kiểu vì QuerySnapshot thật
 * có rất nhiều field khác không liên quan tới test này.
 */
function fakeSnap(ids: string[]) {
  return {
    docs: ids.map((id) => ({ id })),
  } as unknown as Awaited<ReturnType<typeof getDocs>>;
}

describe("listAllResources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gọi ensureAuthReady TRƯỚC getDocs — đóng race lúc mới đăng nhập", async () => {
    mockedGetDocs.mockResolvedValue({
      docs: [{
        id: "r1",
        data: () => ({
          title: "t", slug: "s", type: "article", category: "c", tags: [],
          content: "nd", videoUrl: null, status: "draft", visibility: "public",
          createdBy: "u1",
        }),
      }],
    } as unknown as Awaited<ReturnType<typeof getDocs>>);

    await listAllResources();

    const ensureAuthReadyOrder = vi.mocked(ensureAuthReady).mock.invocationCallOrder[0];
    const getDocsOrder = mockedGetDocs.mock.invocationCallOrder[0];
    expect(ensureAuthReadyOrder).toBeDefined();
    expect(getDocsOrder).toBeDefined();
    expect(ensureAuthReadyOrder).toBeLessThan(getDocsOrder!);
  });
});

describe("isSlugTaken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gọi ensureAuthReady TRƯỚC getDocs — đóng race lúc mới đăng nhập (I5)", async () => {
    mockedGetDocs.mockResolvedValue(fakeSnap([]));

    await isSlugTaken("ky-thuat-tho", null);

    const ensureAuthReadyOrder = vi.mocked(ensureAuthReady).mock.invocationCallOrder[0];
    const getDocsOrder = mockedGetDocs.mock.invocationCallOrder[0];
    expect(ensureAuthReadyOrder).toBeDefined();
    expect(getDocsOrder).toBeDefined();
    expect(ensureAuthReadyOrder).toBeLessThan(getDocsOrder!);
  });

  it("slug đã được bài KHÁC dùng -> true", async () => {
    mockedGetDocs.mockResolvedValue(fakeSnap(["other-id"]));
    expect(await isSlugTaken("ky-thuat-tho", null)).toBe(true);
  });

  it("slug trùng nhưng là CHÍNH bài đang sửa (exceptId khớp id duy nhất) -> false", async () => {
    mockedGetDocs.mockResolvedValue(fakeSnap(["r1"]));
    expect(await isSlugTaken("ky-thuat-tho", "r1")).toBe(false);
  });

  it("exceptId = null: mọi document trùng đều tính là đã dùng", async () => {
    mockedGetDocs.mockResolvedValue(fakeSnap(["r1"]));
    expect(await isSlugTaken("ky-thuat-tho", null)).toBe(true);
  });

  it("một trong nhiều document trùng KHÔNG phải bài đang sửa -> true", async () => {
    mockedGetDocs.mockResolvedValue(fakeSnap(["r1", "r2"]));
    expect(await isSlugTaken("ky-thuat-tho", "r1")).toBe(true);
  });

  it("không có document nào trùng slug -> false", async () => {
    mockedGetDocs.mockResolvedValue(fakeSnap([]));
    expect(await isSlugTaken("ky-thuat-tho", null)).toBe(false);
  });
});

import { describe, it, expect, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { ResourceListItem } from "./queries-public";

// "server-only" ném lỗi ngay khi import ở môi trường không phải Next.js RSC
// (kể cả Vitest) — mock để file thật (giữ nguyên "import server-only") load
// được. Mock luôn "./admin" để không kéo firebase-admin thật vào test —
// filterResources là hàm thuần, không cần Firestore.
vi.mock("server-only", () => ({}));
vi.mock("./admin", () => ({ adminDb: vi.fn() }));

const { adminDb } = await import("./admin");
const {
  filterResources, listPublishedResources, getResourceBySlug,
  listPublishedTests, getPublishedTest, toCbtModuleListItem, normalizeForSearch,
} = await import("./queries-public");
const mockedAdminDb = vi.mocked(adminDb);

function makeItem(overrides: Partial<ResourceListItem> = {}): ResourceListItem {
  return {
    id: "r1",
    title: "Bài viết",
    slug: "bai-viet",
    type: "article",
    category: "lo-au-thi",
    tags: ["hoc-tap"],
    content: "Nội dung",
    tryThis: "",
    videoUrl: null,
    status: "published",
    visibility: "public",
    createdBy: "teacher-1",
    ...overrides,
  };
}

describe("filterResources", () => {
  it("không filter gì thì giữ nguyên danh sách (mặc định loại student_only)", () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" })];
    expect(filterResources(items, {}).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("includeStudentOnly=false (mặc định) loại resource student_only", () => {
    const items = [
      makeItem({ id: "public", visibility: "public" }),
      makeItem({ id: "private", visibility: "student_only" }),
    ];
    expect(filterResources(items, {}).map((r) => r.id)).toEqual(["public"]);
  });

  it("includeStudentOnly=true giữ lại cả resource student_only", () => {
    const items = [
      makeItem({ id: "public", visibility: "public" }),
      makeItem({ id: "private", visibility: "student_only" }),
    ];
    expect(
      filterResources(items, { includeStudentOnly: true }).map((r) => r.id),
    ).toEqual(["public", "private"]);
  });

  it("lọc theo category", () => {
    const items = [
      makeItem({ id: "a", category: "lo-au-thi" }),
      makeItem({ id: "b", category: "ky-nang-hoc" }),
    ];
    expect(
      filterResources(items, { category: "ky-nang-hoc" }).map((r) => r.id),
    ).toEqual(["b"]);
  });

  it("lọc theo tag — khớp khi tag nằm trong 1 trong nhiều tags", () => {
    const items = [
      makeItem({ id: "a", tags: ["hoc-tap", "thi-cu"] }),
      makeItem({ id: "b", tags: ["giai-tri"] }),
    ];
    expect(filterResources(items, { tag: "thi-cu" }).map((r) => r.id)).toEqual([
      "a",
    ]);
  });

  it("kết hợp includeStudentOnly + category + tag", () => {
    const items = [
      makeItem({
        id: "match",
        visibility: "student_only",
        category: "lo-au-thi",
        tags: ["thi-cu"],
      }),
      makeItem({
        id: "wrong-category",
        visibility: "student_only",
        category: "ky-nang-hoc",
        tags: ["thi-cu"],
      }),
      makeItem({
        id: "wrong-tag",
        visibility: "student_only",
        category: "lo-au-thi",
        tags: ["giai-tri"],
      }),
    ];
    // includeStudentOnly=false loại cả 3 (đều student_only)
    expect(
      filterResources(items, {
        includeStudentOnly: false,
        category: "lo-au-thi",
        tag: "thi-cu",
      }),
    ).toEqual([]);
    // includeStudentOnly=true + đúng category + đúng tag chỉ còn "match"
    expect(
      filterResources(items, {
        includeStudentOnly: true,
        category: "lo-au-thi",
        tag: "thi-cu",
      }).map((r) => r.id),
    ).toEqual(["match"]);
  });

  it("limit áp dụng SAU khi đã lọc — không cắt bớt trước rồi mới lọc", () => {
    const items = [
      makeItem({ id: "a", category: "lo-au-thi" }),
      makeItem({ id: "b", category: "khac" }), // sẽ bị loại bởi filter category
      makeItem({ id: "c", category: "lo-au-thi" }),
      makeItem({ id: "d", category: "lo-au-thi" }),
    ];
    // Nếu limit cắt trước khi lọc category, kết quả có thể thiếu "c"/"d".
    const result = filterResources(items, { category: "lo-au-thi", limit: 2 });
    expect(result.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("mảng rỗng trả về mảng rỗng", () => {
    expect(filterResources([], {})).toEqual([]);
  });
});

// --- Quy hồi: hàm đọc KHÔNG được spread nguyên document Admin SDK ra ---
// Document thật từ Firestore có thể mang field ngoài schema (vd: updatedAt là
// một Firestore Timestamp — class instance, không phải plain object). Nếu lọt
// vào object trả về rồi bị truyền tiếp vào Client Component, Next.js crash lúc
// render (đây chính xác là lỗi phát hiện khi Task 19 publish bài test đầu
// tiên qua console admin). Test này khẳng định object trả về CHỈ có đúng field
// mà ResourceListItem/TestListItem khai báo, dù document thô có thêm gì đi nữa.

class FakeTimestamp {
  readonly seconds = 1_700_000_000;
  readonly nanoseconds = 0;
}

type FakeQuery = {
  collection: (...args: unknown[]) => FakeQuery;
  where: (...args: unknown[]) => FakeQuery;
  orderBy: (...args: unknown[]) => FakeQuery;
  limit: (...args: unknown[]) => FakeQuery;
  doc: (...args: unknown[]) => FakeQuery;
  get: () => Promise<unknown>;
};

/**
 * Fake tối giản của Firestore Admin SDK — chỉ implement đúng các method mà
 * queries-public.ts thật sự gọi (collection/where/orderBy/limit/doc/get); mọi
 * method trừ get() trả về chính nó để chain tiếp được. Ép kiểu sang Firestore
 * vì interface thật có hàng chục method khác không liên quan tới test này.
 */
function fakeDb(getResult: unknown): Firestore {
  const chain: FakeQuery = {
    collection: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    doc: () => chain,
    get: () => Promise.resolve(getResult),
  };
  return chain as unknown as Firestore;
}

const RAW_RESOURCE = {
  title: "Bài viết", slug: "bai-viet", type: "article", category: "lo-au-thi",
  tags: ["hoc-tap"], content: "Nội dung",
  tryThis: "", videoUrl: null, status: "published",
  visibility: "public", createdBy: "teacher-1",
  // Field ngoài schema — mô phỏng đúng thứ Firestore thật sự trả về.
  createdAt: new FakeTimestamp(), updatedAt: new FakeTimestamp(),
};

const RAW_TEST = {
  title: "Test lo âu", version: 1, status: "published", isSampleContent: true,
  questions: [{ id: "q1", text: "Câu 1", options: [
    { label: "Không", score: 0 }, { label: "Có", score: 1 },
  ]}],
  scoring: { thresholds: [{ min: 0, max: 1, level: "thap", interpretation: "Thấp." }] },
  disclaimer: "Không phải chẩn đoán.", updatedBy: "admin-1",
  // Field ngoài schema mà saveTest/publishTest (Task 19) thực sự ghi.
  updatedAt: new FakeTimestamp(),
};

const EXPECTED_RESOURCE_KEYS = [
  "id", "title", "slug", "type", "category", "tags", "content", "tryThis", "videoUrl",
  "status", "visibility", "createdBy",
].sort();

const EXPECTED_TEST_KEYS = [
  "id", "title", "version", "status", "isSampleContent", "questions",
  "scoring", "disclaimer", "purpose", "expertReviewedBy", "updatedBy",
].sort();

describe("hàm đọc chỉ trả về đúng field đã khai báo trong type", () => {
  it("listPublishedResources: bỏ hết field ngoài schema (kể cả Timestamp)", async () => {
    mockedAdminDb.mockReturnValue(fakeDb({ docs: [{ id: "r1", data: () => RAW_RESOURCE }] }));
    const [item] = await listPublishedResources();
    expect(Object.keys(item!).sort()).toEqual(EXPECTED_RESOURCE_KEYS);
  });

  it("getResourceBySlug: bỏ hết field ngoài schema (kể cả Timestamp)", async () => {
    mockedAdminDb.mockReturnValue(fakeDb({ docs: [{ id: "r1", data: () => RAW_RESOURCE }] }));
    const item = await getResourceBySlug("bai-viet");
    expect(item).not.toBeNull();
    expect(Object.keys(item!).sort()).toEqual(EXPECTED_RESOURCE_KEYS);
  });

  it("listPublishedTests: bỏ hết field ngoài schema (kể cả Timestamp)", async () => {
    mockedAdminDb.mockReturnValue(fakeDb({ docs: [{ id: "t1", data: () => RAW_TEST }] }));
    const [item] = await listPublishedTests();
    expect(Object.keys(item!).sort()).toEqual(EXPECTED_TEST_KEYS);
  });

  it("getPublishedTest: bỏ hết field ngoài schema (kể cả Timestamp)", async () => {
    mockedAdminDb.mockReturnValue(fakeDb({ exists: true, id: "t1", data: () => RAW_TEST }));
    const item = await getPublishedTest("t1");
    expect(item).not.toBeNull();
    expect(Object.keys(item!).sort()).toEqual(EXPECTED_TEST_KEYS);
  });

  it("toCbtModuleListItem chỉ trả field khai báo, không mang Timestamp", () => {
    const raw = {
      title: "Bài mẫu", version: 1, status: "published", isSampleContent: true,
      disclaimer: "d", intro: "i", steps: [{ id: "s1", prompt: "p", hint: "h" }],
      closingText: "c", suggestedResourceSlugs: [], updatedBy: "admin",
      updatedAt: new FakeTimestamp(), createdAt: new FakeTimestamp(),
    };
    const item = toCbtModuleListItem("m1", raw as never);
    expect(Object.keys(item).sort()).toEqual([
      "closingText", "disclaimer", "id", "intro", "isSampleContent", "status",
      "steps", "suggestedResourceSlugs", "title", "updatedBy", "version",
    ]);
  });
});

describe("normalizeForSearch", () => {
  it("bỏ dấu thanh và dấu nguyên âm", () => {
    expect(normalizeForSearch("Kỹ thuật thở")).toBe("ky thuat tho");
  });

  // đ/Đ KHÔNG phân rã theo NFD nên phải xử lý riêng. Thiếu bước đó thì học
  // sinh gõ "dong" sẽ không tìm ra bài có chữ "đông".
  it("chuyển đ thành d", () => {
    expect(normalizeForSearch("Đông")).toBe("dong");
    expect(normalizeForSearch("ĐỀ THI")).toBe("de thi");
  });

  it("chuyển về chữ thường và cắt khoảng trắng thừa", () => {
    expect(normalizeForSearch("  BÌNH TĨNH  ")).toBe("binh tinh");
  });
});

describe("filterResources — tìm kiếm", () => {
  const items = [
    makeItem({ id: "a", title: "Kỹ thuật thở 4-7-8", category: "thu-gian", tags: ["tho"] }),
    makeItem({ id: "b", title: "Chia nhỏ buổi ôn", category: "hoc-tap", tags: ["ke-hoach"] }),
  ];

  it("không có từ khoá thì trả về tất cả", () => {
    expect(filterResources(items, { search: "" })).toHaveLength(2);
  });

  // Đây là lý do tồn tại của việc bỏ dấu: học sinh gõ nhanh trên điện thoại
  // thường không bỏ dấu.
  it("gõ không dấu vẫn tìm được bài có dấu", () => {
    const found = filterResources(items, { search: "ky thuat" });
    expect(found.map((r) => r.id)).toEqual(["a"]);
  });

  it("tìm được theo chủ đề và theo thẻ", () => {
    expect(filterResources(items, { search: "hoc-tap" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterResources(items, { search: "ke-hoach" }).map((r) => r.id)).toEqual(["b"]);
  });

  // Cố ý KHÔNG tìm trong nội dung bài: một từ phổ biến sẽ khớp gần như toàn bộ
  // thư viện và học sinh không đoán được vì sao ra kết quả đó.
  it("không tìm trong nội dung bài", () => {
    const withContent = [makeItem({ id: "c", title: "Tiêu đề khác", content: "chứa chữ độcđáo" })];
    expect(filterResources(withContent, { search: "docdao" })).toHaveLength(0);
  });

  it("kết hợp được với lọc theo chủ đề", () => {
    const found = filterResources(items, { category: "thu-gian", search: "tho" });
    expect(found.map((r) => r.id)).toEqual(["a"]);
  });
});

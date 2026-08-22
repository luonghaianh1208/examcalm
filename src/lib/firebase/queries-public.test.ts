import { describe, it, expect, vi } from "vitest";
import type { ResourceListItem } from "./queries-public";

// "server-only" ném lỗi ngay khi import ở môi trường không phải Next.js RSC
// (kể cả Vitest) — mock để file thật (giữ nguyên "import server-only") load
// được. Mock luôn "./admin" để không kéo firebase-admin thật vào test —
// filterResources là hàm thuần, không cần Firestore.
vi.mock("server-only", () => ({}));
vi.mock("./admin", () => ({ adminDb: vi.fn() }));

const { filterResources } = await import("./queries-public");

function makeItem(overrides: Partial<ResourceListItem> = {}): ResourceListItem {
  return {
    id: "r1",
    title: "Bài viết",
    slug: "bai-viet",
    type: "article",
    category: "lo-au-thi",
    tags: ["hoc-tap"],
    content: "Nội dung",
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

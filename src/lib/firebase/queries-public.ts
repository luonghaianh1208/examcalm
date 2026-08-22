import "server-only";

import { adminDb } from "./admin";
import type { Resource } from "@/lib/types/resource";
import type { TestDefinition } from "@/lib/types/test";

export type ResourceListItem = Resource & { id: string };
export type TestListItem = TestDefinition & { id: string };

export type ListResourcesOptions = {
  /** true khi người xem đã đăng nhập — mở thêm resource student_only */
  includeStudentOnly?: boolean;
  category?: string;
  tag?: string;
  limit?: number;
};

/**
 * Trần số document lấy từ Firestore trước khi lọc trong bộ nhớ. Thư viện
 * resource của ExamCalm là nội dung do giáo viên biên soạn thủ công — vài
 * chục document, không phải hàng nghìn — nên lọc 300 document trong bộ nhớ
 * là rẻ và dễ đoán.
 */
const FETCH_CAP = 300;

/**
 * Lọc thuần (không đụng Firestore) áp dụng visibility/category/tag rồi cắt
 * limit — tách riêng để unit-test được mà không cần mock Firebase.
 */
export function filterResources(
  items: ResourceListItem[],
  opts: ListResourcesOptions = {},
): ResourceListItem[] {
  const { includeStudentOnly = false, category, tag, limit = 50 } = opts;

  return items
    .filter((r) => includeStudentOnly || r.visibility === "public")
    .filter((r) => !category || r.category === category)
    .filter((r) => !tag || r.tags.includes(tag))
    .slice(0, limit);
}

/**
 * Đánh đổi: chỉ dùng ĐÚNG 1 query shape Firestore (status==published, sắp
 * theo updatedAt) rồi lọc visibility/category/tag trong bộ nhớ, thay vì suy
 * ra nhiều composite index cho từng tổ hợp filter. Lý do: Firestore Emulator
 * không enforce composite index, nên một index sai thứ tự field vẫn "chạy
 * được" ở local và chỉ vỡ ở production — đúng lớp lỗi ta đang muốn loại bỏ.
 * Gộp về 1 query shape xoá hẳn lớp lỗi đó.
 * Giới hạn: khi thư viện vượt quá vài trăm resource đã publish, cách này bắt
 * đầu tải dư dữ liệu không dùng tới. Lúc đó nên đẩy filter ngược lại
 * Firestore bằng composite index được verify trên project thật (không phải
 * Emulator), chỉ là một thay đổi khoanh vùng trong đúng hàm này.
 */
export async function listPublishedResources(
  opts: ListResourcesOptions = {},
): Promise<ResourceListItem[]> {
  const snap = await adminDb()
    .collection("resources")
    .where("status", "==", "published")
    .orderBy("updatedAt", "desc")
    .limit(FETCH_CAP)
    .get();

  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Resource) }));
  return filterResources(items, opts);
}

export async function getResourceBySlug(
  slug: string,
  includeStudentOnly = false,
): Promise<ResourceListItem | null> {
  const snap = await adminDb()
    .collection("resources")
    .where("slug", "==", slug)
    .where("status", "==", "published")
    .limit(1)
    .get();

  const docSnap = snap.docs[0];
  if (!docSnap) return null;

  const data = docSnap.data() as Resource;
  if (data.visibility === "student_only" && !includeStudentOnly) return null;

  return { id: docSnap.id, ...data };
}

export async function listPublishedTests(): Promise<TestListItem[]> {
  const snap = await adminDb()
    .collection("testDefinitions")
    .where("status", "==", "published")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TestDefinition) }));
}

export async function getPublishedTest(testId: string): Promise<TestListItem | null> {
  const docSnap = await adminDb().collection("testDefinitions").doc(testId).get();
  if (!docSnap.exists) return null;
  const data = docSnap.data() as TestDefinition;
  if (data.status !== "published") return null;
  return { id: docSnap.id, ...data };
}

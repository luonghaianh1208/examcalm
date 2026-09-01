import "server-only";

import { adminDb } from "./admin";
import type { Resource } from "@/lib/types/resource";
import type { TestDefinition } from "@/lib/types/test";
import type { CbtModule } from "@/lib/types/cbt";
import type { MusicTrack } from "@/lib/types/music";

export type ResourceListItem = Resource & { id: string };
export type TestListItem = TestDefinition & { id: string };
export type CbtModuleListItem = CbtModule & { id: string };

export type ListResourcesOptions = {
  /** true khi người xem đã đăng nhập — mở thêm resource student_only */
  includeStudentOnly?: boolean;
  category?: string;
  tag?: string;
  /** Chuỗi học sinh gõ vào ô tìm kiếm. So khớp không phân biệt dấu. */
  search?: string;
  limit?: number;
};

/**
 * Bỏ dấu tiếng Việt để học sinh gõ "tho" vẫn tìm được "thở".
 *
 * NFD tách nguyên âm khỏi dấu thanh rồi xoá dấu, nhưng đ/Đ KHÔNG phân rã theo
 * NFD nên phải xử lý riêng — thiếu bước này thì gõ "dong" không ra "đông".
 *
 * Ở đây bỏ dấu là an toàn, khác hẳn bộ dò từ khoá khủng hoảng: sai sót tệ nhất
 * của tìm kiếm là hiện thừa một kết quả.
 */
export function normalizeForSearch(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

/**
 * Trần số document lấy từ Firestore trước khi lọc trong bộ nhớ. Thư viện
 * resource của ExamCalm là nội dung do giáo viên biên soạn thủ công — vài
 * chục document, không phải hàng nghìn — nên lọc 300 document trong bộ nhớ
 * là rẻ và dễ đoán.
 */
const FETCH_CAP = 300;

/**
 * Liệt kê tường minh từng field thay vì spread `d.data()` — document Admin SDK
 * đọc về có thể mang theo field không nằm trong type (vd: `updatedAt` là một
 * Firestore `Timestamp`, một class instance chứ không phải plain object) mà
 * spread sẽ vô tình mang theo. Field nào không liệt kê ở đây thì không bao giờ
 * lọt vào object trả về — kể cả khi document có thêm field mới sau này — nên
 * không có class instance nào có thể lọt qua Client Component boundary.
 */
function toResourceListItem(id: string, data: Resource): ResourceListItem {
  return {
    id,
    title: data.title,
    slug: data.slug,
    type: data.type,
    category: data.category,
    tags: data.tags,
    content: data.content,
    // ?? "" — document tạo trước khi có field này thì không mang nó.
    tryThis: data.tryThis ?? "",
    videoUrl: data.videoUrl,
    status: data.status,
    visibility: data.visibility,
    createdBy: data.createdBy,
  };
}

/** Xem giải thích ở toResourceListItem() — cùng lý do, cho testDefinitions. */
function toTestListItem(id: string, data: TestDefinition): TestListItem {
  return {
    id,
    title: data.title,
    version: data.version,
    status: data.status,
    isSampleContent: data.isSampleContent,
    questions: data.questions,
    scoring: data.scoring,
    disclaimer: data.disclaimer,
    // ?? — document tạo trước khi có field này thì không mang nó.
    purpose: data.purpose ?? "",
    expertReviewedBy: data.expertReviewedBy ?? "",
    updatedBy: data.updatedBy,
  };
}

/**
 * Lọc thuần (không đụng Firestore) áp dụng visibility/category/tag rồi cắt
 * limit — tách riêng để unit-test được mà không cần mock Firebase.
 */
export function filterResources(
  items: ResourceListItem[],
  opts: ListResourcesOptions = {},
): ResourceListItem[] {
  const { includeStudentOnly = false, category, tag, search, limit = 50 } = opts;

  // Chỉ khớp trên tiêu đề, chủ đề và thẻ — CỐ Ý không tìm trong nội dung bài.
  // Bài viết dài nên tìm trong nội dung sẽ khiến một từ phổ biến trả về gần
  // như toàn bộ thư viện, học sinh không đoán được vì sao ra kết quả đó.
  const q = search ? normalizeForSearch(search) : "";

  return items
    .filter((r) => includeStudentOnly || r.visibility === "public")
    .filter((r) => !category || r.category === category)
    .filter((r) => !tag || r.tags.includes(tag))
    .filter((r) => {
      if (!q) return true;
      const haystack = normalizeForSearch(
        [r.title, r.category, ...r.tags].join(" "),
      );
      return haystack.includes(q);
    })
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

  const items = snap.docs.map((d) => toResourceListItem(d.id, d.data() as Resource));
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

  return toResourceListItem(docSnap.id, data);
}

export async function listPublishedTests(): Promise<TestListItem[]> {
  const snap = await adminDb()
    .collection("testDefinitions")
    .where("status", "==", "published")
    .get();
  return snap.docs.map((d) => toTestListItem(d.id, d.data() as TestDefinition));
}

export async function getPublishedTest(testId: string): Promise<TestListItem | null> {
  const docSnap = await adminDb().collection("testDefinitions").doc(testId).get();
  if (!docSnap.exists) return null;
  const data = docSnap.data() as TestDefinition;
  if (data.status !== "published") return null;
  return toTestListItem(docSnap.id, data);
}

/** Liệt kê tường minh — xem giải thích ở toResourceListItem(). */
export function toCbtModuleListItem(id: string, data: CbtModule): CbtModuleListItem {
  return {
    id,
    title: data.title,
    version: data.version,
    status: data.status,
    isSampleContent: data.isSampleContent,
    disclaimer: data.disclaimer,
    intro: data.intro,
    steps: data.steps,
    closingText: data.closingText,
    suggestedResourceSlugs: data.suggestedResourceSlugs,
    updatedBy: data.updatedBy,
  };
}

export async function listPublishedCbtModules(): Promise<CbtModuleListItem[]> {
  const snap = await adminDb()
    .collection("cbtModules")
    .where("status", "==", "published")
    .get();
  return snap.docs.map((d) => toCbtModuleListItem(d.id, d.data() as CbtModule));
}

export async function getPublishedCbtModule(id: string): Promise<CbtModuleListItem | null> {
  const snap = await adminDb().collection("cbtModules").doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() as CbtModule;
  if (data.status !== "published") return null;
  return toCbtModuleListItem(snap.id, data);
}

export type MusicTrackListItem = MusicTrack & { id: string };

/** Liệt kê tường minh — xem giải thích ở toResourceListItem(). */
function toMusicTrackListItem(id: string, data: MusicTrack): MusicTrackListItem {
  return {
    id,
    title: data.title,
    artist: data.artist ?? "",
    youtubeUrl: data.youtubeUrl,
    mood: data.mood,
    rightsNote: data.rightsNote,
    status: data.status,
    order: data.order ?? 0,
    updatedBy: data.updatedBy,
  };
}

/**
 * Bài nhạc đã publish, sắp theo `order` rồi tới tiêu đề.
 *
 * Sắp trong bộ nhớ chứ không orderBy ở Firestore: cùng lý do với
 * listPublishedResources — giữ đúng MỘT query shape để không sinh thêm
 * composite index mà Emulator không kiểm tra được.
 */
export async function listPublishedMusicTracks(): Promise<MusicTrackListItem[]> {
  const snap = await adminDb()
    .collection("musicTracks")
    .where("status", "==", "published")
    .limit(FETCH_CAP)
    .get();

  return snap.docs
    .map((d) => toMusicTrackListItem(d.id, d.data() as MusicTrack))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "vi"));
}

export type PublicConfession = { id: string; textContent: string; createdAt: Date | null };

/**
 * Bảng tin Confession công khai.
 *
 * Đọc từ `confessionsPublic` — collection KHÔNG chứa authorUid. Đây là ranh
 * giới của lời hứa ẩn danh, nên hàm này CỐ Ý không nhận tham số nào cho phép
 * lọc theo tác giả: không có đường nào để hỏi "bài nào là của bạn X".
 */
export async function listPublicConfessions(max = 50): Promise<PublicConfession[]> {
  const snap = await adminDb()
    .collection("confessionsPublic")
    .orderBy("createdAt", "desc")
    .limit(max)
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      textContent: typeof data.textContent === "string" ? data.textContent : "",
      createdAt: data.createdAt?.toDate?.() ?? null,
    };
  });
}

/** true khi trường đã bật tính năng Confession. Đọc aiConfig bằng Admin SDK — client không đọc được document này. */
export async function isConfessionEnabled(): Promise<boolean> {
  const snap = await adminDb().collection("systemConfig").doc("aiConfig").get();
  return snap.data()?.confessionEnabled === true;
}

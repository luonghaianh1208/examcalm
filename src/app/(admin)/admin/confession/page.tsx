import { requireAdmin } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";
import { ConfessionQueue, type QueueItem } from "@/components/admin/ConfessionQueue";

export const metadata = { title: "Duyệt Confession" };

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

export default async function Page() {
  await requireAdmin();

  /*
   * Chỉ lấy bài đang `hold` — đúng phần việc cần người thật.
   *
   * `pending` là trạng thái thoáng qua (Cloud Function đang xử lý), còn
   * `auto_approved`/`rejected` đã xong. Đổ cả bốn trạng thái vào một danh sách
   * sẽ biến hàng chờ thành một bảng dữ liệu, và người trực không còn biết hôm
   * nay mình phải làm bao nhiêu việc.
   */
  const snap = await adminDb()
    .collection("confessions")
    .where("status", "==", "hold")
    .orderBy("createdAt", "asc")
    .limit(100)
    .get();

  // Chuyển Date sang chuỗi Ở ĐÂY: Date là object đi qua ranh giới Server →
  // Client Component được, nhưng định dạng ngày tháng nên quyết định một lần ở
  // phía server để mọi người duyệt thấy cùng một kiểu hiển thị.
  const items: QueueItem[] = snap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt?.toDate?.() ?? null;
    return {
      id: d.id,
      textContent: typeof data.textContent === "string" ? data.textContent : "",
      moderationReason:
        typeof data.moderationReason === "string" && data.moderationReason !== ""
          ? data.moderationReason
          : "Chờ người đọc.",
      createdAt: createdAt ? dateFormatter.format(createdAt) : null,
    };
  });

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold text-ink">Duyệt Confession</h1>
      <p className="mb-6 text-muted">
        Bài đang chờ người thật đọc. Bài cũ nhất lên trước — một bài nằm đây quá lâu nghĩa là
        một học sinh đã mở lòng rồi bị im lặng.
      </p>
      <ConfessionQueue items={items} />
    </>
  );
}

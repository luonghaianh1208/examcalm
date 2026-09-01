import { requireAdmin } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";
import { ConfessionQueue, type QueueItem } from "@/components/admin/ConfessionQueue";

export const metadata = { title: "Duyệt Confession" };

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

function toItems(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  fallbackReason: string,
): QueueItem[] {
  return docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt?.toDate?.() ?? null;
    return {
      id: d.id,
      textContent: typeof data.textContent === "string" ? data.textContent : "",
      moderationReason:
        typeof data.moderationReason === "string" && data.moderationReason !== ""
          ? data.moderationReason
          : fallbackReason,
      createdAt: createdAt ? dateFormatter.format(createdAt) : null,
    };
  });
}

export default async function Page() {
  await requireAdmin();

  /*
   * Hai danh sách, hai việc khác nhau.
   *
   * `hold` là việc PHẢI làm: bài đang chờ người đọc.
   *
   * `auto_approved` là đường THU HỒI. Kiểm duyệt tự động có thể sai — đo thực
   * tế cho thấy mọi model đều có lúc bị lừa cho qua một bài lẽ ra phải giữ
   * lại. Không có chỗ nào gỡ bài đã đăng nghĩa là khi điều đó xảy ra thì không
   * ai làm gì được, và nội dung xấu nằm đó cho tới khi có người sửa code.
   *
   * `pending` không hiện: đó là trạng thái thoáng qua trong lúc Cloud Function
   * đang chạy, không phải việc của người duyệt.
   */
  const [holdSnap, publishedSnap] = await Promise.all([
    adminDb()
      .collection("confessions")
      .where("status", "==", "hold")
      .orderBy("createdAt", "asc")
      .limit(100)
      .get(),
    adminDb()
      .collection("confessions")
      .where("status", "==", "auto_approved")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get(),
  ]);

  const cho = toItems(holdSnap.docs, "Chờ người đọc.");
  const daDang = toItems(publishedSnap.docs, "Đã đăng công khai.");

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold text-ink">Duyệt Confession</h1>
      <p className="mb-6 text-muted">
        Bài đang chờ người thật đọc. Bài cũ nhất lên trước — một bài nằm đây quá lâu nghĩa là
        một học sinh đã mở lòng rồi bị im lặng.
      </p>
      <ConfessionQueue items={cho} />

      <section className="mt-10">
        <h2 className="mb-2 text-lg font-medium text-ink">Bài đang hiển thị công khai</h2>
        <p className="mb-4 text-sm text-muted">
          Kiểm duyệt tự động có thể sai. Thấy bài nào không ổn thì gỡ xuống ngay — bài sẽ biến
          mất khỏi bảng tin của học sinh.
        </p>
        <ConfessionQueue items={daDang} mode="published" />
      </section>
    </>
  );
}

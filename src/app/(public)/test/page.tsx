import Link from "next/link";
import { listPublishedTests } from "@/lib/firebase/queries-public";
import { estimateMinutes } from "@/lib/test-meta";

export const metadata = { title: "Bài kiểm tra" };
// Trang đọc dữ liệu do admin quản lý trong Firestore — nếu prerender lúc
// build (ISR), build sẽ phụ thuộc vào việc kết nối được database, cả ở CI
// lẫn ở Cloud Build khi deploy. Render động theo từng request để build
// không bao giờ cần database.
export const dynamic = "force-dynamic";

export default async function Page() {
  const tests = await listPublishedTests();

  return (
    <div className="mx-auto w-full max-w-[760px] py-10">
      <h1 className="mb-2 text-2xl font-semibold text-ink">Bài kiểm tra</h1>
      <p className="mb-6 text-muted">
        Các bài kiểm tra giúp bạn hiểu hơn trạng thái của mình. Đây là công cụ tự tìm hiểu,
        không phải công cụ chẩn đoán.
      </p>

      {tests.length === 0 ? (
        <p className="rounded-[var(--ec-radius-lg)] bg-subtle px-5 py-6 text-body">
          Chưa có bài kiểm tra nào được đăng.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tests.map((test) => {
            const minutes = estimateMinutes(test.questions.length);
            return (
              <li key={test.id}>
                <Link
                  href={`/test/${test.id}`}
                  className="block rounded-[var(--ec-radius-lg)] border border-line px-5 py-4 transition-colors hover:bg-subtle"
                >
                  <span className="font-medium text-ink">{test.title}</span>
                  {/* Phản hồi 1.1-1.4: nói rõ mất bao lâu, bao nhiêu câu, giúp
                      hiểu gì, đã thẩm định chưa — NGAY ở danh sách, trước khi
                      học sinh bấm vào. */}
                  <span className="mt-1 block text-sm text-muted">
                    {minutes > 0 && `khoảng ${minutes} phút · `}
                    {test.questions.length} câu
                    {test.expertReviewedBy
                      ? ` · đã thẩm định bởi ${test.expertReviewedBy}`
                      : " · chưa có chuyên gia thẩm định"}
                  </span>
                  {test.purpose && (
                    <span className="mt-2 block text-body">{test.purpose}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

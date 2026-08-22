import Link from "next/link";
import { listPublishedResources } from "@/lib/firebase/queries-public";
import { getSessionUser } from "@/lib/firebase/session";
import { ResourceCard } from "@/components/library/ResourceCard";

export const metadata = {
  title: "Thư viện · ExamCalm",
  description: "Bài viết, mẹo nhỏ và hướng dẫn giúp bạn bớt căng thẳng trước kỳ thi.",
};

// Trang đọc dữ liệu do admin quản lý trong Firestore — nếu prerender lúc
// build (ISR), build sẽ phụ thuộc vào việc kết nối được database, cả ở CI
// lẫn ở Cloud Build khi deploy. Render động theo từng request để build
// không bao giờ cần database.
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ chu_de?: string; the?: string }>;
}) {
  const { chu_de: category, the: tag } = await searchParams;
  const user = await getSessionUser();

  const resources = await listPublishedResources({
    includeStudentOnly: Boolean(user),
    category,
    tag,
  });

  const categories = [...new Set(resources.map((r) => r.category))].sort();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Thư viện</h1>
      <p className="mb-6 text-slate-600">
        Những kỹ thuật ngắn bạn có thể thử ngay hôm nay.
      </p>

      {categories.length > 0 && (
        <nav aria-label="Lọc theo chủ đề" className="mb-6 flex flex-wrap gap-2">
          <Link href="/thu-vien" className="rounded-full border px-3 py-1 text-sm">Tất cả</Link>
          {categories.map((c) => (
            <Link key={c} href={`/thu-vien?chu_de=${encodeURIComponent(c)}`} className="rounded-full border px-3 py-1 text-sm">
              {c}
            </Link>
          ))}
        </nav>
      )}

      {resources.length === 0 ? (
        <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">
          Chưa có nội dung nào ở mục này.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {resources.map((r) => <ResourceCard key={r.id} resource={r} />)}
        </ul>
      )}
    </main>
  );
}

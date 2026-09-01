import Link from "next/link";
import { listPublishedResources } from "@/lib/firebase/queries-public";
import { getSessionUser } from "@/lib/firebase/session";
import { ResourceCard } from "@/components/library/ResourceCard";
import { SavedResourceList } from "@/components/library/SavedResourceList";

export const metadata = {
  title: "Thư viện",
  description: "Bài viết, mẹo nhỏ và hướng dẫn giúp bạn bớt căng thẳng trước kỳ thi.",
};

// Trang đọc dữ liệu do admin quản lý trong Firestore — nếu prerender lúc
// build (ISR), build sẽ phụ thuộc vào việc kết nối được database, cả ở CI
// lẫn ở Cloud Build khi deploy. Render động theo từng request để build
// không bao giờ cần database.
export const dynamic = "force-dynamic";

const CHIP = "rounded-full px-4 py-1.5 text-sm transition-colors";
const CHIP_ON = "bg-brand-soft font-medium text-ink";
const CHIP_OFF = "border border-line text-body hover:bg-subtle";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ chu_de?: string; the?: string; tim?: string; loc?: string }>;
}) {
  const { chu_de: category, the: tag, tim: search, loc } = await searchParams;
  const user = await getSessionUser();

  // Chip "Đã lưu" chỉ có nghĩa khi đã đăng nhập. Khách gõ thẳng ?loc=da-luu
  // thì rơi về danh sách thường thay vì thấy trang lỗi.
  const savedOnly = loc === "da-luu" && Boolean(user);

  const resources = await listPublishedResources({
    includeStudentOnly: Boolean(user),
    // Khi đang xem mục đã lưu thì KHÔNG lọc theo chủ đề/từ khoá: SavedResourceList
    // cần đủ danh sách để đối chiếu với id đã lưu, lọc trước sẽ làm biến mất
    // bài mà học sinh đã lưu từ chủ đề khác.
    category: savedOnly ? undefined : category,
    tag: savedOnly ? undefined : tag,
    search: savedOnly ? undefined : search,
    limit: savedOnly ? 200 : 50,
  });

  // Danh sách chủ đề lấy từ TOÀN BỘ thư viện, không phải từ kết quả đã lọc —
  // nếu lấy từ kết quả thì tìm xong các chip khác sẽ biến mất, học sinh không
  // còn đường quay lại.
  const all = await listPublishedResources({ includeStudentOnly: Boolean(user), limit: 200 });
  const categories = [...new Set(all.map((r) => r.category))].sort();

  return (
    <div className="mx-auto w-full max-w-[760px] py-10">
      <h1 className="mb-2 text-2xl font-semibold text-ink">Thư viện</h1>
      <p className="mb-6 text-muted">Những kỹ thuật ngắn bạn có thể thử ngay hôm nay.</p>

      {/* Form GET, không cần JavaScript: gõ rồi Enter là ra kết quả. Giữ lại
          chủ đề đang chọn qua input ẩn để tìm kiếm không xoá mất bộ lọc. */}
      <form method="get" action="/thu-vien" className="mb-4 flex gap-2" role="search">
        {category && <input type="hidden" name="chu_de" value={category} />}
        <input
          type="search"
          name="tim"
          defaultValue={search ?? ""}
          placeholder="Tìm bài viết, kỹ thuật hoặc chủ đề..."
          aria-label="Tìm trong thư viện"
          className="min-h-11 flex-1 rounded-[var(--ec-radius-md)] border border-line bg-surface px-4"
        />
        <button
          type="submit"
          className="min-h-11 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 font-medium text-ink-inverse"
        >
          Tìm
        </button>
      </form>

      <nav aria-label="Lọc thư viện" className="mb-6 flex flex-wrap gap-2">
        <Link href="/thu-vien" className={`${CHIP} ${!category && !savedOnly ? CHIP_ON : CHIP_OFF}`}>
          Tất cả
        </Link>
        {categories.map((c) => (
          <Link
            key={c}
            href={`/thu-vien?chu_de=${encodeURIComponent(c)}`}
            className={`${CHIP} ${category === c && !savedOnly ? CHIP_ON : CHIP_OFF}`}
          >
            {c}
          </Link>
        ))}
        {user && (
          <Link href="/thu-vien?loc=da-luu" className={`${CHIP} ${savedOnly ? CHIP_ON : CHIP_OFF}`}>
            Đã lưu
          </Link>
        )}
      </nav>

      {savedOnly ? (
        <SavedResourceList uid={user!.uid} allResources={resources} />
      ) : resources.length === 0 ? (
        <p className="rounded-[var(--ec-radius-lg)] bg-subtle px-5 py-6 text-body">
          {search
            ? `Không tìm thấy bài nào khớp với “${search}”. Thử một từ khoá ngắn hơn xem sao.`
            : "Chưa có nội dung nào ở mục này."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {resources.map((r) => <ResourceCard key={r.id} resource={r} />)}
        </ul>
      )}
    </div>
  );
}

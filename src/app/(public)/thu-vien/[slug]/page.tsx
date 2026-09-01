import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getResourceBySlug,
  listPublishedCbtModules,
  listPublishedResources,
} from "@/lib/firebase/queries-public";
import { getSessionUser } from "@/lib/firebase/session";
import { VideoEmbed } from "@/components/library/VideoEmbed";
import { FavoriteButton } from "@/components/library/FavoriteButton";

// Trang đọc dữ liệu do admin quản lý trong Firestore — nếu prerender lúc
// build (ISR), build sẽ phụ thuộc vào việc kết nối được database, cả ở CI
// lẫn ở Cloud Build khi deploy. Render động theo từng request để build
// không bao giờ cần database.
export const dynamic = "force-dynamic";

const RELATED_LIMIT = 3;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getSessionUser();
  const resource = await getResourceBySlug(slug, Boolean(user));
  return { title: resource ? resource.title : "Không tìm thấy" };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getSessionUser();
  const resource = await getResourceBySlug(slug, Boolean(user));
  if (!resource) notFound();

  const signedIn = Boolean(user);

  // Hai truy vấn này độc lập nhau nên chạy song song — tuần tự thì trang chờ
  // hai lượt Firestore thay vì một.
  const [sameCategory, cbtModules] = await Promise.all([
    listPublishedResources({ includeStudentOnly: signedIn, category: resource.category }),
    listPublishedCbtModules(),
  ]);

  const related = sameCategory.filter((r) => r.slug !== resource.slug).slice(0, RELATED_LIMIT);

  /*
   * "Bài tập CBT phù hợp" suy ra từ QUAN HỆ CÓ THẬT trong dữ liệu: mỗi bài tập
   * CBT có sẵn `suggestedResourceSlugs` do thầy cô khai. Ở đây chỉ lật ngược
   * quan hệ đó lại.
   *
   * Cố ý KHÔNG rơi về "hiện đại một bài CBT bất kỳ" khi không tìm thấy bài nào
   * khớp — gắn nhãn "phù hợp" cho một nội dung chọn ngẫu nhiên là nói dối học
   * sinh về mức độ cá nhân hoá của sản phẩm.
   */
  const relatedCbt = cbtModules
    .filter((m) => m.suggestedResourceSlugs.includes(resource.slug))
    .slice(0, RELATED_LIMIT);

  return (
    <div className="mx-auto w-full max-w-[760px] py-10">
      <h1 className="mb-2 text-2xl font-semibold text-ink">{resource.title}</h1>
      <p className="mb-6 text-sm text-muted">{resource.category}</p>

      {resource.videoUrl && (
        <div className="mb-6">
          <VideoEmbed url={resource.videoUrl} title={resource.title} />
        </div>
      )}

      <div className="prose max-w-none">
        <Markdown remarkPlugins={[remarkGfm]}>{resource.content}</Markdown>
      </div>

      {/* Bốn khối cuối bài — phản hồi nhóm 3 của học sinh. Khối nào không có
          dữ liệu thì KHÔNG hiện, thay vì hiện một khung rỗng. */}
      {resource.tryThis && (
        <section className="mt-10 rounded-[var(--ec-radius-lg)] bg-feature-library/10 px-5 py-4">
          <h2 className="mb-1 font-semibold text-ink">Một việc có thể thử ngay</h2>
          <p className="text-body">{resource.tryThis}</p>
        </section>
      )}

      {relatedCbt.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 font-semibold text-ink">Bài tập CBT phù hợp</h2>
          <ul className="flex flex-col gap-2">
            {relatedCbt.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/cbt/${m.id}`}
                  className="flex items-center gap-3 rounded-[var(--ec-radius-md)] bg-feature-cbt/10 px-4 py-3"
                >
                  <span className="size-2 shrink-0 rounded-full bg-feature-cbt" aria-hidden />
                  <span className="text-ink">{m.title}</span>
                  <span className="ml-auto shrink-0 text-sm text-muted">
                    {m.steps.length} bước
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 font-semibold text-ink">Bài viết liên quan</h2>
          <ul className="flex flex-col gap-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/thu-vien/${r.slug}`}
                  className="flex items-center gap-3 rounded-[var(--ec-radius-md)] border border-line px-4 py-3"
                >
                  <span className="size-2 shrink-0 rounded-full bg-feature-library" aria-hidden />
                  <span className="text-ink">{r.title}</span>
                  {r.videoUrl && (
                    <span className="ml-auto shrink-0 text-sm text-muted">Video</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {user && (
        <div className="mt-8 border-t border-line pt-6">
          <FavoriteButton uid={user.uid} resourceId={resource.id} />
        </div>
      )}
    </div>
  );
}

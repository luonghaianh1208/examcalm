import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getResourceBySlug } from "@/lib/firebase/queries-public";
import { getSessionUser } from "@/lib/firebase/session";
import { VideoEmbed } from "@/components/library/VideoEmbed";
import { FavoriteButton } from "@/components/library/FavoriteButton";

// Trang đọc dữ liệu do admin quản lý trong Firestore — nếu prerender lúc
// build (ISR), build sẽ phụ thuộc vào việc kết nối được database, cả ở CI
// lẫn ở Cloud Build khi deploy. Render động theo từng request để build
// không bao giờ cần database.
export const dynamic = "force-dynamic";

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

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-semibold">{resource.title}</h1>

      {resource.videoUrl && (
        <div className="mb-6">
          <VideoEmbed url={resource.videoUrl} title={resource.title} />
        </div>
      )}

      <div className="prose prose-slate max-w-none">
        <Markdown remarkPlugins={[remarkGfm]}>{resource.content}</Markdown>
      </div>

      {user && (
        <div className="mt-8">
          <FavoriteButton uid={user.uid} resourceId={resource.id} />
        </div>
      )}
    </main>
  );
}

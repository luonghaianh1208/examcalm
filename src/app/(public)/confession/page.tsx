import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/firebase/session";
import { isConfessionEnabled, listPublicConfessions } from "@/lib/firebase/queries-public";
import { ConfessionComposer } from "@/components/confession/ConfessionComposer";

export const metadata: Metadata = { title: "Confession" };

// force-dynamic: trang đọc Firestore, không được prerender lúc build.
export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" });

export default async function ConfessionPage() {
  const [enabled, user] = await Promise.all([isConfessionEnabled(), getSessionUser()]);

  /*
   * Tính năng TẮT MẶC ĐỊNH. Bật Confession tạo ra nghĩa vụ vận hành liên tục —
   * phải có người đọc hàng chờ duyệt mỗi ngày. Trường tự bật ở /admin/ai khi
   * đã sắp xếp được người trực.
   */
  if (!enabled) {
    return (
      <div className="mx-auto w-full max-w-[760px] py-10">
        <h1 className="mb-2 text-2xl font-semibold text-ink">Confession</h1>
        <p className="rounded-[var(--ec-radius-lg)] bg-subtle px-5 py-6 text-body">
          Mục này chưa mở. Trường sẽ bật khi đã sắp xếp được thầy cô đọc và duyệt bài.
        </p>
      </div>
    );
  }

  const posts = await listPublicConfessions();

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 py-10">
      <div>
        <h1 className="mb-2 text-2xl font-semibold text-ink">Confession</h1>
        <p className="text-muted">
          Nơi kể một chuyện mà không cần ai biết là bạn. Mọi bài đều được đọc trước khi hiện.
        </p>
      </div>

      {user ? (
        <ConfessionComposer uid={user.uid} canPost={user.emailVerified} />
      ) : (
        <p className="rounded-[var(--ec-radius-lg)] bg-brand-soft px-5 py-4 text-body">
          Bạn đọc được bảng tin mà không cần tài khoản.{" "}
          <Link href="/dang-ky" className="text-link underline">Tạo tài khoản</Link> nếu muốn gửi bài.
        </p>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium text-ink">Bảng tin</h2>
        {posts.length === 0 ? (
          <p className="rounded-[var(--ec-radius-lg)] bg-subtle px-5 py-6 text-body">
            Chưa có bài nào được đăng.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {posts.map((p) => (
              <li
                key={p.id}
                className="rounded-[var(--ec-radius-lg)] border border-line bg-surface px-5 py-4"
              >
                <p className="whitespace-pre-line text-body">{p.textContent}</p>
                {p.createdAt && (
                  <p className="mt-2 text-sm text-muted">{dateFormatter.format(p.createdAt)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

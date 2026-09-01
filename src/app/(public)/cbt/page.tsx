import type { Metadata } from "next";
import Link from "next/link";
import { listPublishedCbtModules } from "@/lib/firebase/queries-public";
import { estimateCbtMinutes } from "@/lib/test-meta";

// force-dynamic: trang đọc Firestore, không được prerender lúc build vì build
// sẽ đòi có database — hỏng CI và Cloud Build. Xem Global Constraints.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Bài tập CBT" };

export default async function CbtListPage() {
  const modules = await listPublishedCbtModules();

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 py-10">
      <h1 className="text-2xl font-semibold text-ink">Bài tập CBT</h1>
      <p className="text-body">
        Những bài tập ngắn giúp bạn nhìn lại một suy nghĩ đang làm bạn lo. Làm lúc nào cũng được,
        bỏ dở giữa chừng cũng không sao.
      </p>

      {modules.length === 0 ? (
        <p className="rounded-[var(--ec-radius-lg)] bg-subtle px-5 py-6 text-body">
          Chưa có bài tập nào. Bạn quay lại sau nhé.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {modules.map((m) => (
            <li key={m.id}>
              <Link
                href={`/cbt/${m.id}`}
                className="block rounded-[var(--ec-radius-lg)] border border-line px-5 py-4 transition-colors hover:bg-subtle"
              >
                <span className="font-medium text-ink">{m.title}</span>
                {/* Phản hồi 2.1 của học sinh: mỗi bài nên ghi rõ thời gian, số
                    bước và mục đích — "5 phút · 4 bước · Giúp nhìn lại một suy
                    nghĩ gây lo". Thời gian tính từ số bước, KHÔNG thêm một
                    trường nhập tay vì nó sẽ lệch ngay lần ai đó thêm bước.
                    Dùng estimateCbtMinutes chứ không phải estimateMinutes: một
                    bước CBT là đọc rồi viết, lâu hơn hẳn một câu trắc nghiệm. */}
                <span className="mt-1 block text-sm text-muted">
                  khoảng {estimateCbtMinutes(m.steps.length)} phút · {m.steps.length} bước
                </span>
                {m.intro && <span className="mt-2 block text-body">{m.intro}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

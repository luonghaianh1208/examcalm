import type { Metadata } from "next";
import Link from "next/link";
import { listPublishedCbtModules } from "@/lib/firebase/queries-public";

// force-dynamic: trang đọc Firestore, không được prerender lúc build vì build
// sẽ đòi có database — hỏng CI và Cloud Build. Xem Global Constraints.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Bài tập CBT" };

export default async function CbtListPage() {
  const modules = await listPublishedCbtModules();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <h1 className="text-2xl font-semibold text-slate-900">Bài tập nhận diện suy nghĩ</h1>
      <p className="text-slate-700">
        Những bài tập ngắn giúp bạn nhìn lại một suy nghĩ đang làm bạn lo. Làm lúc nào cũng được,
        bỏ dở giữa chừng cũng không sao.
      </p>

      {modules.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-slate-600">
          Chưa có bài tập nào. Bạn quay lại sau nhé.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {modules.map((m) => (
            <li key={m.id}>
              <Link
                href={`/cbt/${m.id}`}
                className="block rounded-xl border border-slate-200 p-4 hover:border-teal-400"
              >
                <span className="font-medium text-slate-900">{m.title}</span>
                <span className="block text-sm text-slate-500">{m.steps.length} bước</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

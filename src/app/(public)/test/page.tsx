import Link from "next/link";
import { listPublishedTests } from "@/lib/firebase/queries-public";

export const metadata = { title: "Bài test · ExamCalm" };
export const revalidate = 300;

export default async function Page() {
  const tests = await listPublishedTests();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Bài test</h1>
      <p className="mb-6 text-slate-600">
        Các bài test giúp bạn hiểu hơn trạng thái của mình. Đây là công cụ tự tìm hiểu,
        không phải công cụ chẩn đoán.
      </p>

      {tests.length === 0 ? (
        <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">
          Chưa có bài test nào được đăng.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tests.map((test) => (
            <li key={test.id}>
              <Link href={`/test/${test.id}`} className="block rounded-xl border px-4 py-4 hover:bg-slate-50">
                <span className="font-medium">{test.title}</span>
                <span className="block text-sm text-slate-500">{test.questions.length} câu hỏi</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

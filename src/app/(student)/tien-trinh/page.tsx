import { requireUser } from "@/lib/firebase/session";
import { ProgressView } from "@/components/progress/ProgressView";

export const metadata = { title: "Tiến trình · ExamCalm" };

export default async function Page() {
  const user = await requireUser();
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Tiến trình của bạn</h1>
      <p className="mb-8 text-slate-600">
        Đây là những gì bạn tự ghi lại. Không có xếp hạng, không có chuỗi ngày phải giữ.
      </p>
      <ProgressView uid={user.uid} />
    </main>
  );
}

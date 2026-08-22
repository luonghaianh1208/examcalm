import { requireUser } from "@/lib/firebase/session";
import { MoodHistory } from "@/components/mood/MoodHistory";

export const metadata = { title: "Nhật ký cảm xúc · ExamCalm" };

export default async function Page() {
  const user = await requireUser();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Nhật ký cảm xúc</h1>
      <p className="mb-6 text-slate-600">
        Chỉ mình bạn đọc được những gì ghi ở đây.
      </p>
      <MoodHistory uid={user.uid} />
    </main>
  );
}

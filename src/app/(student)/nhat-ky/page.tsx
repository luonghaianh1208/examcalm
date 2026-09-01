import { requireUser } from "@/lib/firebase/session";
import { JournalPanel } from "@/components/mood/JournalPanel";

export const metadata = { title: "Nhật ký cảm xúc" };

export default async function Page() {
  const user = await requireUser();

  return (
    <div className="mx-auto w-full max-w-[860px] py-10">
      <h1 className="mb-2 text-2xl font-semibold text-ink">Nhật ký cảm xúc</h1>
      <p className="mb-6 text-muted">
        Ghi nhận điều đang diễn ra, không cần viết thật hay. Chỉ mình bạn đọc được những
        gì ghi ở đây.
      </p>
      <JournalPanel uid={user.uid} canSave={user.emailVerified} />
    </div>
  );
}

import { requireAdmin } from "@/lib/firebase/session";
import { MusicEditor } from "@/components/admin/MusicEditor";

export const metadata = { title: "Music Hub" };

export default async function Page() {
  const user = await requireAdmin();

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold text-ink">Music Hub</h1>
      <p className="mb-6 text-muted">
        Nhạc nền cho học sinh, nhóm theo việc các em đang cần làm. Chỉ nhận link YouTube, và
        mỗi bài bắt buộc ghi rõ vì sao được phép dùng.
      </p>
      <MusicEditor uid={user.uid} />
    </>
  );
}

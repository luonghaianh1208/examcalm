import type { Metadata } from "next";
import { listPublishedMusicTracks } from "@/lib/firebase/queries-public";
import { getSessionUser } from "@/lib/firebase/session";
import { MusicHub } from "@/components/music/MusicHub";

export const metadata: Metadata = { title: "Music Hub" };

// force-dynamic: trang đọc Firestore, không được prerender lúc build vì build
// sẽ đòi có database — hỏng CI và Cloud Build.
export const dynamic = "force-dynamic";

export default async function MusicPage() {
  // Kho CHUNG đọc ở server (ai cũng đọc được). Kho RIÊNG do MusicHub tự tải ở
  // client bằng phiên của chính học sinh — rules chỉ cho chủ tài khoản đọc.
  const [tracks, user] = await Promise.all([listPublishedMusicTracks(), getSessionUser()]);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 py-10">
      <div>
        <h1 className="mb-2 text-2xl font-semibold text-ink">Music Hub</h1>
        <p className="text-muted">
          Nhạc nền chọn theo việc bạn đang cần làm. Không tự phát — bạn bấm thì mới chạy.
        </p>
      </div>

      <MusicHub tracks={tracks} uid={user?.uid ?? null} />
    </div>
  );
}

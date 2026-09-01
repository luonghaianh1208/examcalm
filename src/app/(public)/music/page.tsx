import type { Metadata } from "next";
import { listPublishedMusicTracks } from "@/lib/firebase/queries-public";
import { MUSIC_MOODS, MUSIC_MOOD_LABELS } from "@/lib/types/music";
import { MusicTrackCard } from "@/components/music/MusicTrackCard";

export const metadata: Metadata = { title: "Music Hub" };

// force-dynamic: trang đọc Firestore, không được prerender lúc build vì build
// sẽ đòi có database — hỏng CI và Cloud Build.
export const dynamic = "force-dynamic";

export default async function MusicPage() {
  const tracks = await listPublishedMusicTracks();

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 py-10">
      <div>
        <h1 className="mb-2 text-2xl font-semibold text-ink">Music Hub</h1>
        <p className="text-muted">
          Nhạc nền chọn theo việc bạn đang cần làm. Không tự phát — bạn bấm thì mới chạy.
        </p>
      </div>

      {tracks.length === 0 ? (
        <p className="rounded-[var(--ec-radius-lg)] bg-subtle px-5 py-6 text-body">
          Chưa có bài nào. Bạn quay lại sau nhé.
        </p>
      ) : (
        MUSIC_MOODS.map((mood) => {
          const cua = tracks.filter((t) => t.mood === mood);
          // Nhóm rỗng thì không hiện tiêu đề trống — thầy cô có thể mới chỉ
          // thêm nhạc cho một nhóm.
          if (cua.length === 0) return null;
          return (
            <section key={mood}>
              <h2 className="mb-3 text-lg font-medium text-ink">{MUSIC_MOOD_LABELS[mood]}</h2>
              <ul className="flex flex-col gap-3">
                {cua.map((t) => <MusicTrackCard key={t.id} track={t} />)}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

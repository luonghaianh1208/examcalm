"use client";

import { MUSIC_MOOD_LABELS } from "@/lib/types/music";
import type { MusicSuggestionRecord } from "@/lib/firestore/admin-music";

/**
 * Hàng chờ đề xuất nhạc từ học sinh.
 *
 * "Đưa vào form" KHÔNG tự thêm bài vào kho — nó điền sẵn tiêu đề, kênh, link
 * và nhóm vào form bên dưới, còn ô ghi chú bản quyền vẫn trống để thầy cô tự
 * ghi. Đó là toàn bộ lý do bước duyệt này tồn tại: học sinh không có căn cứ để
 * khẳng định một bài nhạc được phép dùng, và một ghi chú bản quyền không ai
 * chịu trách nhiệm còn tệ hơn không có ghi chú nào.
 */
export function MusicSuggestionQueue({
  items,
  onUse,
  onReject,
  busyId,
}: {
  items: MusicSuggestionRecord[];
  onUse: (item: MusicSuggestionRecord) => void;
  onReject: (item: MusicSuggestionRecord) => void;
  busyId: string | null;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium text-ink">Đề xuất từ học sinh</h2>

      {items.length === 0 ? (
        <p className="rounded-[var(--ec-radius-lg)] bg-subtle px-5 py-4 text-body">
          Không có đề xuất nào đang chờ.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-[var(--ec-radius-lg)] border border-line bg-surface px-5 py-4"
            >
              <p className="font-medium text-ink">{item.title}</p>
              <p className="text-sm text-muted">
                {item.artist ? `${item.artist} · ` : ""}
                {MUSIC_MOOD_LABELS[item.mood]}
              </p>
              <p className="mt-1 break-all text-sm">
                <a
                  href={item.youtubeUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-link underline"
                >
                  {item.youtubeUrl}
                </a>
              </p>
              <p className="mt-1 text-xs text-muted">Học sinh: {item.authorUid}</p>

              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => onUse(item)}
                  className="min-h-11 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 text-sm font-medium text-ink-inverse disabled:opacity-60"
                >
                  Đưa vào form thêm bài
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => onReject(item)}
                  className="min-h-11 rounded-[var(--ec-radius-md)] border border-line px-5 text-sm text-body disabled:opacity-60"
                >
                  Lần này chưa nhận
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

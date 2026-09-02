"use client";

import { useState } from "react";
import { VideoEmbed } from "@/components/library/VideoEmbed";
import type { MusicTrackListItem } from "@/lib/firebase/queries-public";

/**
 * Một bài nhạc. Trình phát chỉ được nhúng SAU KHI học sinh bấm phát.
 *
 * Brand Guideline mục 8: "Music Hub: waveform chỉ chạy khi phát; KHÔNG
 * autoplay." Nhúng sẵn cả chục iframe YouTube lúc mở trang vừa nặng, vừa để
 * YouTube đặt cookie/theo dõi trước khi học sinh làm bất cứ điều gì.
 */
export function MusicTrackCard({
  track,
  saved,
  onToggleSave,
}: {
  track: MusicTrackListItem;
  /**
   * `null` = không hiện nút lưu (khách chưa đăng nhập). Kho nhạc cố ý đọc được
   * mà không cần tài khoản — nút lưu là thứ DUY NHẤT đòi đăng nhập ở đây.
   */
  saved: boolean | null;
  onToggleSave?: () => void;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <li className="rounded-[var(--ec-radius-lg)] border border-line bg-surface px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{track.title}</p>
          {track.artist && <p className="text-sm text-muted">{track.artist}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          {saved !== null && (
            <button
              type="button"
              onClick={onToggleSave}
              aria-pressed={saved}
              className="min-h-11 rounded-[var(--ec-radius-md)] border border-line px-4 text-sm text-body"
            >
              {saved ? "Bỏ lưu" : "Lưu"}
            </button>
          )}
          {!playing && (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="min-h-11 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 text-sm font-medium text-ink-inverse"
            >
              Phát
            </button>
          )}
        </div>
      </div>

      {playing && (
        <div className="mt-3">
          <VideoEmbed url={track.youtubeUrl} title={track.title} />
        </div>
      )}

      {/*
        Ghi chú quyền sử dụng hiện CÔNG KHAI, không giấu trong trang quản trị.
        PRD §7.2.8 bắt buộc mỗi asset có metadata quyền sử dụng; để học sinh và
        thầy cô cùng nhìn thấy nó là cách rẻ nhất để không ai âm thầm thêm nhạc
        không rõ nguồn.
      */}
      <p className="mt-3 text-xs text-muted">Nguồn: {track.rightsNote}</p>
    </li>
  );
}

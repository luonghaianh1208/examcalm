"use client";

import { useState } from "react";
import { VideoEmbed } from "@/components/library/VideoEmbed";
import { MUSIC_SUGGESTION_STATUS_LABELS } from "@/lib/types/music";
import type { OwnTrackRecord } from "@/lib/firestore/music-personal";

/**
 * Một bài trong kho riêng. Cùng quy tắc với thẻ nhạc kho chung: KHÔNG nhúng
 * trình phát trước khi học sinh bấm Phát (Brand Guideline mục 8).
 */
export function OwnTrackCard({
  track,
  onSuggest,
  onDelete,
}: {
  track: OwnTrackRecord;
  onSuggest: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [playing, setPlaying] = useState(false);
  const [dangChay, setDangChay] = useState(false);

  async function chay(viec: () => Promise<void>) {
    setDangChay(true);
    try {
      await viec();
    } finally {
      setDangChay(false);
    }
  }

  return (
    <li className="rounded-[var(--ec-radius-lg)] border border-line bg-surface px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{track.title}</p>
          {track.artist && <p className="text-sm text-muted">{track.artist}</p>}
        </div>
        {!playing && (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="min-h-11 shrink-0 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 text-sm font-medium text-ink-inverse"
          >
            Phát
          </button>
        )}
      </div>

      {playing && (
        <div className="mt-3">
          <VideoEmbed url={track.youtubeUrl} title={track.title} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {/*
          Đã đề xuất rồi thì hiện trạng thái thay cho nút — bấm hai lần sẽ tạo
          hai bài giống hệt nhau trong hàng chờ của thầy cô.
        */}
        {track.suggestion === null ? (
          <button
            type="button"
            disabled={dangChay}
            onClick={() => void chay(onSuggest)}
            className="min-h-11 rounded-[var(--ec-radius-md)] border border-line px-4 text-sm text-body disabled:opacity-60"
          >
            Đề xuất cho kho trường
          </button>
        ) : (
          <p className="text-sm text-muted">{MUSIC_SUGGESTION_STATUS_LABELS[track.suggestion]}</p>
        )}

        <button
          type="button"
          disabled={dangChay}
          onClick={() => void chay(onDelete)}
          className="min-h-11 text-sm text-muted underline disabled:opacity-60"
        >
          Xoá khỏi kho của tôi
        </button>
      </div>
    </li>
  );
}

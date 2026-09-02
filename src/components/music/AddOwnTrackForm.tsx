"use client";

import { useState } from "react";
import { studentTrackDraftSchema } from "@/lib/music-personal";
import { MUSIC_MOODS, MUSIC_MOOD_LABELS, type MusicMood } from "@/lib/types/music";

const EMPTY = { title: "", artist: "", youtubeUrl: "", mood: "tap-trung" as MusicMood };

/**
 * Form học sinh tự thêm một bài vào kho riêng.
 *
 * Không có ô ghi chú bản quyền — cố ý. Bài trong kho riêng chỉ mình em ấy
 * nghe; ghi chú đó chỉ cần khi bài vào kho chung, và lúc ấy thầy cô tự điền.
 * Xem src/lib/music-personal.ts.
 */
export function AddOwnTrackForm({ onAdd }: { onAdd: (draft: typeof EMPTY) => Promise<void> }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [dangLuu, setDangLuu] = useState(false);

  function update<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    setError(null);
    const parsed = studentTrackDraftSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ.");
      return;
    }

    setDangLuu(true);
    try {
      await onAdd(parsed.data);
      setForm(EMPTY);
    } catch {
      setError("Chưa lưu được. Kiểm tra lại kết nối mạng rồi thử lần nữa.");
    } finally {
      setDangLuu(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--ec-radius-lg)] border border-line bg-subtle px-5 py-4">
      <p className="font-medium text-ink">Thêm bài của riêng bạn</p>
      <p className="text-sm text-muted">
        Dán link YouTube. Bài này chỉ mình bạn thấy — kể cả thầy cô cũng không xem được.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-body">Tên bài</span>
        <input
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
          className="min-h-11 rounded-[var(--ec-radius-md)] border border-line bg-surface px-3"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-body">Nghệ sĩ hoặc kênh (không bắt buộc)</span>
        <input
          value={form.artist}
          onChange={(e) => update("artist", e.target.value)}
          className="min-h-11 rounded-[var(--ec-radius-md)] border border-line bg-surface px-3"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-body">Link YouTube</span>
        <input
          value={form.youtubeUrl}
          onChange={(e) => update("youtubeUrl", e.target.value)}
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=..."
          className="min-h-11 rounded-[var(--ec-radius-md)] border border-line bg-surface px-3"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-body">Bạn nghe bài này khi nào?</span>
        <select
          value={form.mood}
          onChange={(e) => update("mood", e.target.value as MusicMood)}
          className="min-h-11 rounded-[var(--ec-radius-md)] border border-line bg-surface px-3"
        >
          {MUSIC_MOODS.map((m) => (
            <option key={m} value={m}>{MUSIC_MOOD_LABELS[m]}</option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className="rounded-[var(--ec-radius-md)] bg-danger-soft px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div>
        <button
          type="button"
          disabled={dangLuu}
          onClick={() => void submit()}
          className="min-h-11 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 text-sm font-medium text-ink-inverse disabled:opacity-60"
        >
          {dangLuu ? "Đang thêm…" : "Thêm vào kho của tôi"}
        </button>
      </div>
    </div>
  );
}

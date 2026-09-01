"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listAllMusicTracks,
  musicDraftSchema,
  publishMusicTrack,
  saveMusicTrack,
  type MusicRecord,
} from "@/lib/firestore/admin-music";
import { MUSIC_MOODS, MUSIC_MOOD_LABELS, type MusicMood } from "@/lib/types/music";

type FormState = {
  title: string;
  artist: string;
  youtubeUrl: string;
  mood: MusicMood;
  rightsNote: string;
  order: string;
};

const EMPTY: FormState = {
  title: "",
  artist: "",
  youtubeUrl: "",
  mood: "tap-trung",
  rightsNote: "",
  order: "0",
};

const FIELD = "min-h-11 rounded-[var(--ec-radius-md)] border border-line bg-surface px-4";

export function MusicEditor({ uid }: { uid: string }) {
  const [items, setItems] = useState<MusicRecord[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    listAllMusicTracks()
      .then((r) => { setItems(r); setListFailed(false); })
      .catch(() => setListFailed(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function reset() {
    setEditingId(null);
    setForm({ ...EMPTY });
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const parsed = musicDraftSchema.safeParse({
      title: form.title.trim(),
      artist: form.artist.trim(),
      youtubeUrl: form.youtubeUrl.trim(),
      mood: form.mood,
      rightsNote: form.rightsNote.trim(),
      order: Number(form.order) || 0,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ.");
      return;
    }

    try {
      await saveMusicTrack(parsed.data, uid, editingId);
      setMessage(editingId ? "Đã lưu thay đổi." : "Đã thêm bài mới (đang ở nháp).");
      reset();
      load();
    } catch {
      setError("Chưa lưu được. Kiểm tra lại quyền quản trị và kết nối mạng.");
    }
  }

  async function togglePublish(item: MusicRecord) {
    setError(null);
    try {
      await publishMusicTrack(item.id, item.status !== "published");
      load();
    } catch {
      setError("Chưa đổi được trạng thái.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="rounded-[var(--ec-radius-md)] bg-danger-soft px-4 py-3 text-danger">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-[var(--ec-radius-md)] bg-success-soft px-4 py-3 text-success">
          {message}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h2 className="font-medium text-ink">{editingId ? "Sửa bài" : "Thêm bài mới"}</h2>

        <label className="flex flex-col gap-1">
          <span className="text-ink">Tên bài</span>
          <input value={form.title} onChange={(e) => update("title", e.target.value)} className={FIELD} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink">Nghệ sĩ / kênh</span>
          <input value={form.artist} onChange={(e) => update("artist", e.target.value)} className={FIELD} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink">Link YouTube</span>
          <input
            value={form.youtubeUrl}
            onChange={(e) => update("youtubeUrl", e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className={FIELD}
          />
          <span className="text-sm text-muted">
            Chỉ nhận link YouTube. Link được kiểm ngay ở đây bằng đúng hàm mà trình phát dùng,
            nên lưu được nghĩa là phát được.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink">Nhóm</span>
          <select
            value={form.mood}
            onChange={(e) => update("mood", e.target.value as MusicMood)}
            className={FIELD}
          >
            {MUSIC_MOODS.map((m) => (
              <option key={m} value={m}>{MUSIC_MOOD_LABELS[m]}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink">Vì sao được phép dùng bài này</span>
          <textarea
            value={form.rightsNote}
            onChange={(e) => update("rightsNote", e.target.value)}
            rows={2} maxLength={300}
            placeholder="Ví dụ: Kênh chính thức của nghệ sĩ, cho phép nhúng."
            className="rounded-[var(--ec-radius-md)] border border-line bg-surface px-4 py-3"
          />
          {/* Bắt buộc điền, và câu giải thích nói rõ vì sao — đây là dự án của
              trường, không ai nên âm thầm thêm nhạc mà không nghĩ tới bản quyền. */}
          <span className="text-sm text-muted">
            Bắt buộc. Nội dung này hiện công khai dưới mỗi bài trên trang Music Hub.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink">Thứ tự</span>
          <input
            type="number" min={0}
            value={form.order}
            onChange={(e) => update("order", e.target.value)}
            className={`${FIELD} w-32`}
          />
          <span className="text-sm text-muted">Số nhỏ hiện trước trong cùng một nhóm.</span>
        </label>

        <div className="flex gap-3">
          <button
            type="submit"
            className="min-h-11 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 font-medium text-ink-inverse"
          >
            {editingId ? "Lưu thay đổi" : "Thêm bài"}
          </button>
          {editingId && (
            <button
              type="button" onClick={reset}
              className="min-h-11 rounded-[var(--ec-radius-md)] border border-line px-5 text-body"
            >
              Huỷ
            </button>
          )}
        </div>
      </form>

      <section>
        <h2 className="mb-3 font-medium text-ink">Danh sách</h2>
        {listFailed ? (
          <div className="rounded-[var(--ec-radius-lg)] bg-warning-soft px-5 py-4 text-warning">
            <p>Chưa tải được danh sách. Có thể do mạng chập chờn.</p>
            <button
              type="button" onClick={load}
              className="mt-3 min-h-11 rounded-[var(--ec-radius-md)] border border-current px-4 text-sm font-medium"
            >
              Thử tải lại
            </button>
          </div>
        ) : items === null ? (
          <div aria-busy="true" className="h-24 animate-pulse rounded-[var(--ec-radius-lg)] bg-subtle" />
        ) : items.length === 0 ? (
          <p className="rounded-[var(--ec-radius-lg)] bg-subtle px-5 py-6 text-body">Chưa có bài nào.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-3 rounded-[var(--ec-radius-lg)] border border-line bg-surface px-4 py-3"
              >
                <span className="font-medium text-ink">{item.title}</span>
                <span className="text-sm text-muted">{MUSIC_MOOD_LABELS[item.mood]}</span>
                <span className="rounded-full bg-subtle px-2 py-0.5 text-sm text-body">
                  {item.status === "published" ? "đã đăng" : "nháp"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.id);
                    setForm({
                      title: item.title,
                      artist: item.artist,
                      youtubeUrl: item.youtubeUrl,
                      mood: item.mood,
                      rightsNote: item.rightsNote,
                      order: String(item.order),
                    });
                  }}
                  className="ml-auto text-sm text-link underline"
                >
                  Sửa
                </button>
                <button
                  type="button" onClick={() => togglePublish(item)}
                  className="text-sm text-link underline"
                >
                  {item.status === "published" ? "Gỡ xuống nháp" : "Đăng"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

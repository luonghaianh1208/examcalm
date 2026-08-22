"use client";

import { useState } from "react";
import { MOOD_ICONS, type MoodContext, type MoodIcon } from "@/lib/types/mood";
import type { MoodInput } from "@/lib/firestore/moods";

const ICON_LABELS: Record<MoodIcon, string> = {
  very_low: "Rất mệt",
  low: "Hơi xuống",
  neutral: "Bình thường",
  calm: "Dễ chịu",
  happy: "Vui",
};

type Props = {
  onSubmit: (input: MoodInput) => Promise<void>;
  context?: MoodContext;
  linkedActivityRef?: string | null;
};

export function MoodForm({ onSubmit, context = "standalone", linkedActivityRef = null }: Props) {
  const [moodScore, setMoodScore] = useState(5);
  const [moodIcon, setMoodIcon] = useState<MoodIcon>("neutral");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        moodScore,
        moodIcon,
        note: note.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        context,
        linkedActivityRef,
      });
      setNote("");
      setTags("");
    } catch {
      setError("Chưa lưu được. Mình sẽ thử lại khi có mạng.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Hôm nay bạn thấy thế nào?</legend>
        <div className="flex flex-wrap gap-2">
          {MOOD_ICONS.map((icon) => (
            <label key={icon} className="flex items-center gap-1 rounded-full border px-3 py-1">
              <input
                type="radio" name="moodIcon" value={icon}
                checked={moodIcon === icon}
                onChange={() => setMoodIcon(icon)}
              />
              <span>{ICON_LABELS[icon]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span>Điểm cảm xúc: {moodScore}/10</span>
        <input
          type="range" min={1} max={10} step={1} value={moodScore}
          aria-label="Điểm cảm xúc"
          onChange={(e) => setMoodScore(Number(e.target.value))}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span>Ghi chú <span className="text-slate-500">(không bắt buộc)</span></span>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value)}
          maxLength={2000} rows={3} className="rounded-lg border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span>Thẻ ngữ cảnh <span className="text-slate-500">(không bắt buộc)</span></span>
        <input
          type="text" value={tags} onChange={(e) => setTags(e.target.value)}
          placeholder="ôn thi, mất ngủ" className="rounded-lg border px-3 py-2"
        />
      </label>

      {error && <p role="alert" className="text-slate-700">{error}</p>}

      <button type="submit" disabled={pending} className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white disabled:opacity-60">
        {pending ? "Đang lưu…" : "Lưu vào nhật ký"}
      </button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { MOOD_ICONS, type MoodContext, type MoodIcon } from "@/lib/types/mood";
import type { MoodInput } from "@/lib/firestore/moods";
import { MOOD_LABELS } from "@/lib/mood-labels";

type Props = {
  onSubmit: (input: MoodInput) => Promise<void>;
  context?: MoodContext;
  linkedActivityRef?: string | null;
  /**
   * Nhãn nút gửi. Mặc định là chữ cho nhật ký cảm xúc độc lập ("Lưu vào nhật
   * ký"). Nơi nhúng form vào một luồng khác (vd: CBT trước/sau bài tập) nên
   * truyền nhãn phù hợp với ngữ cảnh đó thay vì dùng mặc định.
   */
  submitLabel?: string;
};

export function MoodForm({
  onSubmit,
  context = "standalone",
  linkedActivityRef = null,
  submitLabel = "Lưu vào nhật ký",
}: Props) {
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="font-medium text-ink">Hôm nay bạn thấy thế nào?</legend>
        <div className="flex flex-wrap gap-2">
          {MOOD_ICONS.map((icon) => {
            const chosen = moodIcon === icon;
            return (
              <label
                key={icon}
                // has-[:focus-visible] chuyển vòng focus của ô radio (đang ẩn
                // bằng sr-only) lên chính cái chip. Thiếu dòng này thì người
                // dùng bàn phím không thấy mình đang ở đâu — guideline mục 11
                // bắt buộc "focus luôn nhìn thấy".
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--ec-radius-pill)] border px-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ec-focus)] ${
                  chosen ? "border-transparent bg-brand-soft font-medium text-ink" : "border-line text-body"
                }`}
              >
                <input
                  type="radio" name="moodIcon" value={icon}
                  checked={chosen}
                  onChange={() => setMoodIcon(icon)}
                  className="sr-only"
                />
                <span className={`size-3 rounded-full ${MOOD_LABELS[icon].dot}`} aria-hidden />
                <span>{MOOD_LABELS[icon].label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-ink">Điểm cảm xúc: {moodScore}/10</span>
        <input
          type="range" min={1} max={10} step={1} value={moodScore}
          aria-label="Điểm cảm xúc"
          onChange={(e) => setMoodScore(Number(e.target.value))}
        />
      </label>

      <label className="flex flex-col gap-1">
        {/* Câu hỏi thay cho nhãn "Ghi chú": học sinh phản ánh từ cũ không mời
            gọi kể lại chuyện. Câu này lấy nguyên văn từ mockup guideline
            trang 21. */}
        <span className="text-ink">
          Điều gì đang chiếm nhiều chỗ nhất trong đầu bạn?{" "}
          <span className="text-muted">(không bắt buộc)</span>
        </span>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value)}
          maxLength={2000} rows={4}
          placeholder="Bạn có thể viết vài dòng, không cần viết thật hay."
          // CỐ Ý không đặt aria-label ở đây. Đặt aria-label="Ghi chú" (tên cũ)
          // sẽ khiến trình đọc màn hình đọc một đằng còn người nhìn thấy một
          // nẻo — vi phạm WCAG 2.5.3 Label in Name. Nhãn nhìn thấy được của
          // <label> bao ngoài đã là tên có thể truy cập rồi.
          className="rounded-[var(--ec-radius-md)] border border-line bg-surface px-4 py-3"
        />
        {/* Guideline mục 5 (Form): "Nhật ký phải nêu rõ dữ liệu riêng tư và
            phần nào có AI xử lý." */}
        <span className="text-sm text-muted">Chỉ bạn mới xem được nội dung này.</span>
      </label>

      <label className="flex flex-col gap-1">
        {/* "Thẻ ngữ cảnh" là từ của người viết phần mềm, không phải của học
            sinh. Tên mới do chủ sản phẩm chọn; dòng gợi ý bên dưới nói rõ đây
            là vài từ khoá chứ không phải một câu. */}
        <span className="text-ink">
          Trạng thái hiện tại <span className="text-muted">(không bắt buộc)</span>
        </span>
        <input
          type="text" value={tags} onChange={(e) => setTags(e.target.value)}
          placeholder="ôn thi, mất ngủ"
          className="min-h-11 rounded-[var(--ec-radius-md)] border border-line bg-surface px-4"
        />
        <span className="text-sm text-muted">Vài từ khoá, cách nhau bằng dấu phẩy.</span>
      </label>

      {error && (
        <p role="alert" className="rounded-[var(--ec-radius-md)] bg-danger-soft px-4 py-3 text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 font-medium text-ink-inverse disabled:opacity-60"
      >
        {pending ? "Đang lưu…" : submitLabel}
      </button>
    </form>
  );
}

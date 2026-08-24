"use client";

import { useEffect, useState } from "react";
import {
  requestReflection,
  getOutputForMoodLog,
  setOutputFeedback,
  deleteOutput,
  type AiJournalOutputRecord,
} from "@/lib/firestore/ai-outputs";

type Props = {
  /** Id của mood log vừa lưu — phản chiếu này thuộc về nó. */
  moodLogId: string;
  /** uid của học sinh — cần để đọc/ghi đúng phản chiếu của chính mình. */
  uid: string;
  /**
   * Học sinh đã tự bật tính năng AI chưa. `false` → không render gì, không
   * gọi callable — im lặng tuyệt đối, không phải trạng thái "tắt" hay lời mời.
   */
  aiOptIn: boolean;
};

type Phase = "loading" | "success" | "error";

/**
 * Hiện phản chiếu của mèo sau khi học sinh ghi một mood log. `requestReflection`
 * chỉ trả về `{ outputId }` (xem functions-client.ts) nên phải đọc tiếp
 * `getOutputForMoodLog` để lấy nội dung thật. Mọi lỗi từ `requestReflection`
 * đã được Task 9 dịch sẵn sang tiếng Việt thân thiện (kể cả thông điệp hết
 * quota) — component này CHỈ hiển thị nguyên văn `err.message`, không tự viết
 * lại câu chữ hay tự phân loại lỗi.
 */
export function ReflectionCard({ moodLogId, uid, aiOptIn }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [record, setRecord] = useState<AiJournalOutputRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    if (!aiOptIn) return;
    let cancelled = false;
    setPhase("loading");
    setErrorMessage(null);

    (async () => {
      try {
        await requestReflection(moodLogId);
        const output = await getOutputForMoodLog(uid, moodLogId);
        if (cancelled) return;
        if (!output) {
          // Ca hiếm: vừa tạo xong mà đọc lại không thấy — trung tính, không
          // gợi ý nhật ký cảm xúc có vấn đề gì.
          setErrorMessage("Không thể tải phản chiếu lúc này, thử lại sau nhé.");
          setPhase("error");
          return;
        }
        setRecord(output);
        setPhase("success");
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Không thể thực hiện thao tác này lúc này, thử lại sau nhé.",
        );
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [aiOptIn, moodLogId, uid]);

  // Im lặng tuyệt đối khi chưa bật — không phải trạng thái rỗng, không upsell.
  if (!aiOptIn) return null;

  async function handleFeedback(value: "helpful" | "not_helpful") {
    if (!record) return;
    const current = record;
    try {
      await setOutputFeedback(current.id, value);
      setRecord({ ...current, userFeedback: value });
    } catch {
      // Nuốt có chủ đích: đánh giá hữu ích/không hữu ích chỉ là dữ liệu phụ,
      // lỗi ghi ở đây không đáng để làm phiền học sinh bằng một thông báo mới.
    }
  }

  async function handleConfirmDelete() {
    if (!record) return;
    try {
      await deleteOutput(record.id);
      setDeleted(true);
      setRecord(null);
    } catch {
      // Giữ nguyên bước xác nhận để học sinh bấm lại thử — không nói đã xoá
      // khi chưa xoá thật.
    }
  }

  return (
    <section aria-label="Phản chiếu từ mèo" className="mt-3 flex flex-col gap-2 rounded-xl bg-teal-50 p-4">
      <p className="text-xs font-medium text-teal-800">Nội dung do AI tạo</p>

      {phase === "loading" && <p aria-busy="true" className="text-slate-600">Đang tạo phản chiếu…</p>}

      {phase === "error" && errorMessage && (
        <p role="status" className="text-slate-700">{errorMessage}</p>
      )}

      {phase === "success" && record && !deleted && (
        <div className="flex flex-col gap-2">
          <p className="text-slate-800">{record.reflectionText}</p>
          <p className="text-slate-700 italic">{record.catStoryText}</p>
          <p className="text-slate-700">{record.journalPrompt}</p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleFeedback("helpful")}
              aria-pressed={record.userFeedback === "helpful"}
              className="rounded-lg border px-3 py-1 text-sm"
            >
              Hữu ích
            </button>
            <button
              type="button"
              onClick={() => handleFeedback("not_helpful")}
              aria-pressed={record.userFeedback === "not_helpful"}
              className="rounded-lg border px-3 py-1 text-sm"
            >
              Không hữu ích
            </button>
          </div>

          {confirmingDelete ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-slate-600">Xoá phản chiếu này? Không thể khôi phục.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-lg border px-3 py-1 text-sm"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="rounded-lg bg-rose-700 px-3 py-1 text-sm font-medium text-white"
                >
                  Xác nhận xoá
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="self-start text-sm text-slate-500 underline"
            >
              Xoá phản chiếu này
            </button>
          )}
        </div>
      )}

      {deleted && <p role="status" className="text-slate-600">Đã xoá phản chiếu này.</p>}
    </section>
  );
}

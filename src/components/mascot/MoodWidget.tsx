"use client";

import { useEffect, useRef, useState } from "react";
import { CatMascot } from "./CatMascot";
import { MoodForm } from "@/components/mood/MoodForm";
import { saveMoodLog, type MoodInput } from "@/lib/firestore/moods";
import { ReflectionCard } from "@/components/ai/ReflectionCard";

type Props = {
  uid: string | null;
  /** đã đăng nhập và đã xác thực email */
  canSave: boolean;
};

/**
 * Widget nổi. Mobile: bám safe-area góc phải dưới (spec §8).
 * Guest bấm vào sẽ thấy lời mời đăng ký; học sinh đã có tài khoản nhưng CHƯA
 * xác thực email thấy lời mời xác thực — không phải lời mời đăng ký (rủ ai đó
 * đã có tài khoản "đăng ký" lại nghe khó hiểu và hơi thờ ơ). `uid` đã đủ để
 * phân biệt hai trường hợp (Guest: uid null; chưa verify: uid có nhưng
 * canSave false), không cần thêm prop.
 */
export function MoodWidget({ uid, canSave }: Props) {
  const [open, setOpen] = useState(false);
  // Id của mood log vừa lưu — khác null nghĩa là panel đang ở trạng thái "đã
  // lưu" (Task 11b, quyết định 2): không tự đóng panel nữa, chỗ này cho
  // ReflectionCard render (nó tự đọc cổng aiOptIn của chính mình, im lặng nếu
  // học sinh chưa bật).
  const [savedMoodLogId, setSavedMoodLogId] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  async function handleSubmit(input: MoodInput) {
    if (!uid || !canSave) return;
    const id = await saveMoodLog(uid, input);
    setSavedMoodLogId(id);
  }

  function handleToggle() {
    if (open) {
      setOpen(false);
      setSavedMoodLogId(null);
    } else {
      setOpen(true);
    }
  }

  function handleClose() {
    setOpen(false);
    setSavedMoodLogId(null);
    // Nút "Đóng" sắp biến mất khỏi DOM cùng cả panel — không trả focus lại
    // nút mèo thì nó rơi về <body> (Fix round 1, Finding 5).
    toggleButtonRef.current?.focus();
  }

  useEffect(() => {
    // Nút "Lưu" vừa biến mất khỏi DOM khi chuyển sang trạng thái "đã lưu" —
    // đưa focus sang nút đóng để bàn phím/trình đọc màn hình có điểm neo mới.
    if (savedMoodLogId) closeButtonRef.current?.focus();
  }, [savedMoodLogId]);

  return (
    <>
      <button
        type="button"
        ref={toggleButtonRef}
        data-tour="mood"
        onClick={handleToggle}
        aria-expanded={open}
        aria-label="Mở nhật ký cảm xúc"
        // Trên mobile phải nâng lên KHỎI thanh điều hướng dưới (68px + safe
        // area). Widget này z-40, thanh nav z-30 — để nguyên 1rem thì nó đè
        // lên nút "Tất cả", đúng điều Brand Guideline mục 11 cấm: "không che
        // CTA quan trọng, input, nút lưu hoặc bottom navigation". Từ md trở lên
        // không còn thanh dưới nên trả về 1rem.
        className="fixed bottom-[calc(var(--ec-mobile-bottom-nav-height)+1rem+env(safe-area-inset-bottom))] right-4 z-40 rounded-full bg-white p-2 shadow-lg motion-safe:transition-transform motion-safe:hover:scale-105 md:bottom-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <CatMascot expression={open ? "listen" : "calm"} size={56} />
      </button>

      {open && (
        <div
          role="dialog" aria-label="Nhật ký cảm xúc"
          // Cùng lý do với nút mở ở trên: bảng nhập cảm xúc cũng phải nằm trên
          // thanh điều hướng dưới khi ở mobile.
          className="fixed bottom-[calc(var(--ec-mobile-bottom-nav-height)+5.5rem+env(safe-area-inset-bottom))] right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-white p-4 shadow-xl md:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]"
        >
          {canSave ? (
            savedMoodLogId ? (
              <div className="flex flex-col gap-3">
                <p role="status" className="text-slate-700">Đã lưu vào nhật ký cảm xúc của bạn.</p>
                {uid && <ReflectionCard moodLogId={savedMoodLogId} uid={uid} />}
                <button
                  type="button"
                  ref={closeButtonRef}
                  onClick={handleClose}
                  className="self-start rounded-lg border px-3 py-1 text-sm"
                >
                  Đóng
                </button>
              </div>
            ) : (
              <MoodForm onSubmit={handleSubmit} />
            )
          ) : uid ? (
            <div className="flex flex-col gap-3">
              <p>Xác thực email xong là bạn ghi được vào nhật ký cảm xúc ngay.</p>
              <a href="/xac-thuc-email" className="rounded-lg bg-teal-600 px-4 py-2 text-center font-medium text-white">
                Xác thực email
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p>Ghi lại cảm xúc để xem nó thay đổi thế nào theo thời gian.</p>
              <a href="/dang-ky" className="rounded-lg bg-teal-600 px-4 py-2 text-center font-medium text-white">
                Đăng ký để lưu nhật ký
              </a>
            </div>
          )}
        </div>
      )}
    </>
  );
}

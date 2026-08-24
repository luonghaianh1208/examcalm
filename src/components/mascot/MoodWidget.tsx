"use client";

import { useState } from "react";
import { CatMascot } from "./CatMascot";
import { MoodForm } from "@/components/mood/MoodForm";
import { saveMoodLog, type MoodInput } from "@/lib/firestore/moods";

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

  async function handleSubmit(input: MoodInput) {
    if (!uid || !canSave) return;
    await saveMoodLog(uid, input);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        data-tour="mood"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Mở nhật ký cảm xúc"
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 rounded-full bg-white p-2 shadow-lg motion-safe:transition-transform motion-safe:hover:scale-105"
      >
        <CatMascot expression={open ? "listen" : "calm"} size={56} />
      </button>

      {open && (
        <div
          role="dialog" aria-label="Nhật ký cảm xúc"
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-white p-4 shadow-xl"
        >
          {canSave ? (
            <MoodForm onSubmit={handleSubmit} />
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setGuideProgress } from "@/lib/firestore/onboarding";

/**
 * Mở lại tour hướng dẫn — Brand Guideline §6.1: "Sau khi completed/dismissed,
 * không tự chạy lại. CÓ THỂ MỞ LẠI từ Trợ giúp/Cài đặt."
 *
 * Đặt về not_started (không phải paused): học sinh chủ động xem lại thì muốn
 * xem từ đầu, chứ không phải nhảy vào giữa một bước họ đã quên ngữ cảnh.
 */
export function ReplayGuideSection({ uid }: { uid: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function xemLai() {
    setPending(true);
    await setGuideProgress(uid, "not_started", 0);
    // refresh() để OnboardingController đọc lại trạng thái; không có nó thì
    // học sinh phải tự tải lại trang mới thấy tour chạy.
    router.refresh();
    setPending(false);
  }

  return (
    <section className="rounded-[var(--ec-radius-lg)] border border-line bg-surface px-5 py-4">
      <h2 className="mb-1 font-medium text-ink">Hướng dẫn sử dụng</h2>
      <p className="mb-3 text-sm text-muted">
        Meo sẽ dẫn bạn qua năm bước chính của ExamCalm. Bạn bỏ qua hoặc để sau lúc nào cũng được.
      </p>
      <button
        type="button"
        onClick={xemLai}
        disabled={pending}
        className="min-h-11 rounded-[var(--ec-radius-md)] border border-line px-5 text-body disabled:opacity-60"
      >
        {pending ? "Đang mở…" : "Xem lại hướng dẫn"}
      </button>
    </section>
  );
}

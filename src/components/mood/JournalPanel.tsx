"use client";

import { useState } from "react";
import { MoodForm } from "./MoodForm";
import { MoodHistory } from "./MoodHistory";
import { CatMascot } from "@/components/mascot/CatMascot";
import { ReflectionCard } from "@/components/ai/ReflectionCard";
import { saveMoodLog, type MoodInput } from "@/lib/firestore/moods";

/**
 * Trang Nhật ký cảm xúc: ô ghi ở trên, lịch sử ở dưới.
 *
 * Trước đây trang này CHỈ có lịch sử — muốn ghi phải bấm con mèo nổi ở góc màn
 * hình, và trạng thái rỗng phải đi hướng dẫn "bấm vào mèo ở góc". Mockup Brand
 * Guideline trang 21 vẽ ô nhập ngay trên trang, và đó cũng là chỗ học sinh tìm
 * đến đầu tiên khi muốn viết.
 *
 * Widget nổi vẫn giữ nguyên: nó phục vụ việc ghi nhanh từ BẤT KỲ trang nào.
 * Hai lối vào cùng ghi vào một chỗ.
 */
export function JournalPanel({ uid, canSave }: { uid: string; canSave: boolean }) {
  const [savedMoodLogId, setSavedMoodLogId] = useState<string | null>(null);
  // Đổi khoá để MoodHistory mount lại và tải danh sách mới sau khi lưu — nếu
  // không, học sinh vừa ghi xong nhìn xuống vẫn thấy danh sách cũ và tưởng là
  // chưa lưu được.
  const [historyKey, setHistoryKey] = useState(0);

  async function handleSubmit(input: MoodInput) {
    const id = await saveMoodLog(uid, input);
    setSavedMoodLogId(id);
    setHistoryKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-6 md:grid-cols-[1fr_auto] md:items-start">
        <div className="min-w-0">
          {canSave ? (
            <MoodForm onSubmit={handleSubmit} />
          ) : (
            <p className="rounded-[var(--ec-radius-lg)] bg-warning-soft px-5 py-4 text-warning">
              Bạn cần xác thực email trước khi lưu nhật ký. Kiểm tra hộp thư giúp mình nhé.
            </p>
          )}
        </div>

        {/* Meo ở trạng thái "đang lắng nghe" — guideline trang 21. Ẩn trên
            mobile: ở đó phần nhập liệu phải chiếm trọn bề ngang. */}
        <aside className="hidden w-[220px] rounded-[var(--ec-radius-lg)] bg-feature-journal/10 px-5 py-5 text-center md:block">
          <CatMascot size={110} expression="listen" className="mx-auto" />
          <p className="mt-3 font-medium text-ink">Meo đang lắng nghe</p>
          <p className="mt-1 text-sm text-body">
            Bạn viết gì cũng được. Không ai chấm điểm những dòng này.
          </p>
        </aside>
      </section>

      {savedMoodLogId && (
        <div>
          <p
            role="status"
            className="mb-4 rounded-[var(--ec-radius-md)] bg-success-soft px-4 py-3 text-success"
          >
            Đã lưu.
          </p>
          {/* ReflectionCard tự đọc cổng đồng ý AI của chính nó và im lặng nếu
              học sinh chưa bật — không cần kiểm tra thêm ở đây. */}
          <ReflectionCard uid={uid} moodLogId={savedMoodLogId} />
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium text-ink">Những lần bạn đã ghi</h2>
        <MoodHistory key={historyKey} uid={uid} />
      </section>
    </div>
  );
}

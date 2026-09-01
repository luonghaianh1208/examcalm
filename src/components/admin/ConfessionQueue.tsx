"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callReviewConfession } from "@/lib/firebase/functions-client";

export type QueueItem = {
  id: string;
  textContent: string;
  moderationReason: string;
  createdAt: string | null;
};

/**
 * Hàng chờ duyệt Confession.
 *
 * Cố ý KHÔNG hiện danh tính tác giả, dù admin đọc được field đó.
 *
 * Người duyệt cần quyết định dựa trên NỘI DUNG, không phải dựa trên ai viết.
 * Biết tên tác giả sẽ làm việc duyệt bị chi phối bởi định kiến sẵn có về học
 * sinh đó — và đó cũng chính là điều lời hứa ẩn danh nói với các em. Trường
 * hợp cần biết danh tính (bài có dấu hiệu tự hại) đã đi qua đường riêng: cảnh
 * báo khủng hoảng, nơi có đủ ngữ cảnh và có ghi vết.
 */
export function ConfessionQueue({ items }: { items: QueueItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function quyetDinh(id: string, approve: boolean) {
    setPendingId(id);
    setError(null);
    try {
      await callReviewConfession(id, approve);
      router.refresh();
    } catch {
      setError("Chưa xử lý được. Kiểm tra lại quyền quản trị và kết nối mạng.");
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="rounded-[var(--ec-radius-lg)] bg-success-soft px-5 py-6 text-success">
        Không có bài nào đang chờ. Hàng chờ trống.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-[var(--ec-radius-md)] bg-danger-soft px-4 py-3 text-danger">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-[var(--ec-radius-lg)] border border-line bg-surface px-5 py-4"
          >
            <p className="whitespace-pre-line text-body">{item.textContent}</p>
            <p className="mt-2 text-sm text-muted">
              {item.moderationReason}
              {item.createdAt && ` · gửi lúc ${item.createdAt}`}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={pendingId === item.id}
                onClick={() => quyetDinh(item.id, true)}
                className="min-h-11 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 text-sm font-medium text-ink-inverse disabled:opacity-60"
              >
                Cho đăng
              </button>
              <button
                type="button"
                disabled={pendingId === item.id}
                onClick={() => quyetDinh(item.id, false)}
                className="min-h-11 rounded-[var(--ec-radius-md)] border border-line px-5 text-sm text-body disabled:opacity-60"
              >
                Không đăng
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

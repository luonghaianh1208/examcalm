"use client";

import { useCallback, useEffect, useState } from "react";
import { listMyMoodLogs, deleteMoodLog, type MoodRecord } from "@/lib/firestore/moods";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium", timeStyle: "short",
});

export function MoodHistory({ uid }: { uid: string }) {
  const [logs, setLogs] = useState<MoodRecord[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(() => {
    listMyMoodLogs(uid)
      .then((result) => {
        setLogs(result);
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true));
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    await deleteMoodLog(id);
    setLogs((prev) => prev?.filter((l) => l.id !== id) ?? null);
  }

  // Trạng thái lỗi PHẢI tách riêng khỏi trạng thái rỗng: gộp lỗi tải vào danh
  // sách rỗng sẽ khiến một học sinh đã viết nhật ký nhiều tuần, gặp trục trặc
  // mạng, đọc được dòng "chưa viết gì" — đọc như thể bài viết của mình đã mất,
  // dù nó vẫn còn nguyên trên server.
  if (loadFailed) {
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-6 text-amber-900">
        <p>
          Chưa tải được nhật ký lúc này — có thể do mạng chập chờn thôi.
          Những gì bạn đã viết vẫn còn nguyên, không mất đâu.
        </p>
        <button
          type="button"
          onClick={load}
          className="mt-3 rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-900"
        >
          Thử tải lại
        </button>
      </div>
    );
  }

  if (logs === null) {
    return <div aria-busy="true" className="h-24 animate-pulse rounded-xl bg-slate-200" />;
  }

  if (logs.length === 0) {
    return (
      <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">
        Chưa có ghi chép nào. Bấm vào mèo ở góc màn hình để ghi lần đầu nhé.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {logs.map((log) => (
        <li key={log.id} className="rounded-xl border bg-white px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{log.moodScore}/10</span>
            <span className="text-sm text-slate-500">
              {log.createdAt ? dateFormatter.format(log.createdAt) : "Đang đồng bộ…"}
            </span>
          </div>
          {log.note && <p className="mt-1 text-slate-700">{log.note}</p>}
          {log.tags.length > 0 && (
            <p className="mt-1 text-sm text-slate-500">{log.tags.join(" · ")}</p>
          )}
          <button
            type="button" onClick={() => handleDelete(log.id)}
            className="mt-2 text-sm text-slate-500 underline"
          >
            Xóa ghi chép này
          </button>
        </li>
      ))}
    </ul>
  );
}

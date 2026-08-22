"use client";

import { useCallback, useEffect, useState } from "react";
import { listMyAttempts, type AttemptRecord } from "@/lib/firestore/attempts";
import { listMyMoodLogs, type MoodRecord } from "@/lib/firestore/moods";
import { summarizeMood, pairBeforeAfter } from "@/lib/progress";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" });

export function ProgressView({ uid }: { uid: string }) {
  const [attempts, setAttempts] = useState<AttemptRecord[] | null>(null);
  const [attemptsFailed, setAttemptsFailed] = useState(false);
  const [moods, setMoods] = useState<MoodRecord[] | null>(null);
  const [moodsFailed, setMoodsFailed] = useState(false);

  // Hai section (lịch sử test, cảm xúc) độc lập với nhau: nếu một fetch lỗi,
  // section kia vẫn hiển thị bình thường thay vì cả trang cùng báo lỗi —
  // nên mỗi fetch giữ trạng thái lỗi riêng, không dùng chung một cờ.
  const loadAttempts = useCallback(() => {
    listMyAttempts(uid)
      .then((result) => {
        setAttempts(result);
        setAttemptsFailed(false);
      })
      .catch(() => setAttemptsFailed(true));
  }, [uid]);

  const loadMoods = useCallback(() => {
    listMyMoodLogs(uid)
      .then((result) => {
        setMoods(result);
        setMoodsFailed(false);
      })
      .catch(() => setMoodsFailed(true));
  }, [uid]);

  useEffect(() => {
    loadAttempts();
  }, [loadAttempts]);

  useEffect(() => {
    loadMoods();
  }, [loadMoods]);

  const summary = moods === null ? null : summarizeMood(moods);
  const pairs = moods === null ? [] : pairBeforeAfter(moods);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-lg font-medium">Cảm xúc gần đây</h2>
        {moodsFailed ? (
          <div className="rounded-xl bg-amber-50 px-4 py-6 text-amber-900">
            <p>
              Chưa tải được ghi chép cảm xúc lúc này — có thể do mạng chập chờn thôi.
              Những gì bạn đã ghi vẫn còn nguyên, không mất đâu.
            </p>
            <button
              type="button"
              onClick={loadMoods}
              className="mt-3 rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-900"
            >
              Thử tải lại
            </button>
          </div>
        ) : moods === null ? (
          <div aria-busy="true" className="h-24 animate-pulse rounded-xl bg-slate-200" />
        ) : summary === null ? (
          <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">
            Chưa có ghi chép nào. Bấm vào mèo ở góc màn hình để bắt đầu.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white px-4 py-3"><dt className="text-sm text-slate-500">Gần nhất</dt><dd className="text-xl">{summary.latest}/10</dd></div>
            <div className="rounded-xl bg-white px-4 py-3"><dt className="text-sm text-slate-500">Trung bình</dt><dd className="text-xl">{summary.average}/10</dd></div>
            <div className="rounded-xl bg-white px-4 py-3"><dt className="text-sm text-slate-500">Thấp nhất</dt><dd className="text-xl">{summary.lowest}/10</dd></div>
            <div className="rounded-xl bg-white px-4 py-3"><dt className="text-sm text-slate-500">Số lần ghi</dt><dd className="text-xl">{summary.count}</dd></div>
          </dl>
        )}
      </section>

      {pairs.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-medium">Trước và sau hoạt động</h2>
          <p className="mb-3 text-sm text-slate-500">
            Đây là ghi nhận cảm xúc của chính bạn ở hai thời điểm, không phải bằng chứng
            rằng hoạt động đó tạo ra thay đổi.
          </p>
          <ul className="flex flex-col gap-2">
            {pairs.map((p) => (
              <li key={p.activityRef} className="rounded-xl bg-white px-4 py-3">
                {p.before}/10 → {p.after}/10
                <span className="ml-2 text-slate-500">
                  ({p.delta > 0 ? `+${p.delta}` : p.delta})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">Lịch sử làm test</h2>
        {attemptsFailed ? (
          <div className="rounded-xl bg-amber-50 px-4 py-6 text-amber-900">
            <p>
              Chưa tải được lịch sử làm test lúc này — có thể do mạng chập chờn thôi.
              Kết quả bạn đã làm vẫn còn nguyên, không mất đâu.
            </p>
            <button
              type="button"
              onClick={loadAttempts}
              className="mt-3 rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-900"
            >
              Thử tải lại
            </button>
          </div>
        ) : attempts === null ? (
          <div aria-busy="true" className="h-24 animate-pulse rounded-xl bg-slate-200" />
        ) : attempts.length === 0 ? (
          <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">Bạn chưa làm bài test nào.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {attempts.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between rounded-xl bg-white px-4 py-3">
                <span>Điểm {a.score}</span>
                <span className="text-sm text-slate-500">
                  {a.createdAt ? dateFormatter.format(a.createdAt) : "Đang đồng bộ…"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listMyAttempts, type AttemptRecord } from "@/lib/firestore/attempts";
import { listMyMoodLogs, type MoodRecord } from "@/lib/firestore/moods";
import { listMyCbtSessions, type CbtSessionRecord } from "@/lib/firestore/cbt-sessions";
import { pairBeforeAfter } from "@/lib/progress";
import { MOOD_LABELS } from "@/lib/mood-labels";
import { TREND_RANGES, pointsInRange, type TrendRange } from "@/lib/mood-trend";
import { CatMascot } from "@/components/mascot/CatMascot";
import { MoodTrendChart } from "./MoodTrendChart";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" });

const CARD = "rounded-[var(--ec-radius-lg)] bg-surface px-5 py-4 shadow-[var(--ec-shadow-card)]";

function KhoiLoi({ noiDung, thuLai }: { noiDung: string; thuLai: () => void }) {
  return (
    <div className="rounded-[var(--ec-radius-lg)] bg-warning-soft px-5 py-5 text-warning">
      <p>{noiDung}</p>
      <button
        type="button"
        onClick={thuLai}
        className="mt-3 min-h-11 rounded-[var(--ec-radius-md)] border border-current px-4 text-sm font-medium"
      >
        Thử tải lại
      </button>
    </div>
  );
}

export function ProgressView({ uid }: { uid: string }) {
  const [attempts, setAttempts] = useState<AttemptRecord[] | null>(null);
  const [attemptsFailed, setAttemptsFailed] = useState(false);
  const [moods, setMoods] = useState<MoodRecord[] | null>(null);
  const [moodsFailed, setMoodsFailed] = useState(false);
  const [cbtSessions, setCbtSessions] = useState<CbtSessionRecord[] | null>(null);
  const [cbtFailed, setCbtFailed] = useState(false);
  const [range, setRange] = useState<TrendRange>(7);

  // Ba section (lịch sử test, cảm xúc, CBT) độc lập với nhau: nếu một fetch lỗi,
  // các section kia vẫn hiển thị bình thường thay vì cả trang cùng báo lỗi —
  // nên mỗi fetch giữ trạng thái lỗi riêng, không dùng chung một cờ.
  const loadAttempts = useCallback(() => {
    listMyAttempts(uid)
      .then((result) => { setAttempts(result); setAttemptsFailed(false); })
      .catch(() => setAttemptsFailed(true));
  }, [uid]);

  const loadMoods = useCallback(() => {
    listMyMoodLogs(uid)
      .then((result) => { setMoods(result); setMoodsFailed(false); })
      .catch(() => setMoodsFailed(true));
  }, [uid]);

  const loadCbt = useCallback(() => {
    listMyCbtSessions(uid)
      .then((result) => { setCbtSessions(result); setCbtFailed(false); })
      .catch(() => setCbtFailed(true));
  }, [uid]);

  useEffect(() => { loadAttempts(); }, [loadAttempts]);
  useEffect(() => { loadMoods(); }, [loadMoods]);
  useEffect(() => { loadCbt(); }, [loadCbt]);

  const pairs = moods === null ? [] : pairBeforeAfter(moods);
  const points = moods === null ? [] : pointsInRange(moods, range);

  // listMyMoodLogs trả về mới nhất trước, nên phần tử đầu là lần gần nhất.
  const moiNhat = moods?.[0] ?? null;

  // "Hoạt động gần đây": lấy mốc thời gian mới nhất trong ba loại. Bản ghi chưa
  // có createdAt (serverTimestamp chưa trả về) bị bỏ qua vì không so sánh được.
  const hoatDong = [
    moiNhat?.createdAt ? { khi: moiNhat.createdAt, ten: "Nhật ký cảm xúc" } : null,
    cbtSessions?.[0]?.createdAt ? { khi: cbtSessions[0]!.createdAt!, ten: "Bài tập CBT" } : null,
    attempts?.[0]?.createdAt ? { khi: attempts[0]!.createdAt!, ten: "Bài kiểm tra" } : null,
  ]
    .filter((x): x is { khi: Date; ten: string } => x !== null)
    .sort((a, b) => b.khi.getTime() - a.khi.getTime())[0];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Chào bạn, hôm nay mình đi chậm nhé.</h1>
        {/* Câu này là ranh giới của cả trang: Dashboard phản ánh hành trình của
            chính học sinh, KHÔNG xếp hạng và KHÔNG chẩn đoán — guideline mục 5. */}
        <p className="mt-1 text-muted">
          Dashboard chỉ phản ánh hành trình của chính bạn — không xếp hạng, không chẩn đoán.
        </p>
      </header>

      {/* Ba thẻ trả lời đúng ba câu hỏi: tôi đang ở đâu · tôi vừa làm gì · tôi
          có thể thử gì tiếp theo (guideline trang 22). */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={CARD}>
          <p className="text-sm text-muted">Lần ghi nhận gần nhất</p>
          {moods === null ? (
            <div aria-busy="true" className="mt-2 h-6 w-24 animate-pulse rounded bg-subtle" />
          ) : moiNhat ? (
            <p className="mt-1 flex items-center gap-2 text-lg font-semibold text-ink">
              <span
                className={`size-3 shrink-0 rounded-full ${MOOD_LABELS[moiNhat.moodIcon].dot}`}
                aria-hidden
              />
              {MOOD_LABELS[moiNhat.moodIcon].label} · {moiNhat.moodScore}/10
            </p>
          ) : (
            <p className="mt-1 text-body">Chưa có</p>
          )}
        </div>

        <div className={CARD}>
          <p className="text-sm text-muted">Hoạt động gần đây</p>
          <p className="mt-1 text-lg font-semibold text-ink">{hoatDong?.ten ?? "Chưa có"}</p>
          {hoatDong && (
            <p className="text-sm text-muted">{dateFormatter.format(hoatDong.khi)}</p>
          )}
        </div>

        <Link href="/cbt" className={`${CARD} block transition-transform motion-safe:hover:-translate-y-0.5`}>
          <p className="text-sm text-muted">Một điều có thể thử</p>
          <p className="mt-1 text-lg font-semibold text-ink">Bài tập CBT</p>
          {/* CỐ Ý không nói "dành riêng cho bạn": đây là một lối đi, không phải
              gợi ý được cá nhân hoá từ dữ liệu. */}
          <p className="text-sm text-muted">Chọn một bài ngắn</p>
        </Link>
      </div>

      <section className={CARD}>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium text-ink">Xu hướng tự báo cáo</h2>
          <div role="tablist" aria-label="Khoảng thời gian" className="flex gap-1">
            {TREND_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={range === r}
                onClick={() => setRange(r)}
                className={`min-h-9 rounded-[var(--ec-radius-pill)] px-3 text-sm transition-colors ${
                  range === r ? "bg-brand-soft font-medium text-ink" : "text-body hover:bg-subtle"
                }`}
              >
                {r} ngày
              </button>
            ))}
          </div>
        </div>
        {/* Bắt buộc theo guideline mục 5: "Chart ghi rõ nguồn là dữ liệu tự
            báo cáo." */}
        <p className="mb-4 text-sm text-muted">
          Điểm do chính bạn ghi nhận, không phải chỉ số chẩn đoán.
        </p>

        {moodsFailed ? (
          <KhoiLoi
            noiDung="Chưa tải được ghi chép cảm xúc lúc này — có thể do mạng chập chờn thôi. Những gì bạn đã ghi vẫn còn nguyên, không mất đâu."
            thuLai={loadMoods}
          />
        ) : moods === null ? (
          <div aria-busy="true" className="h-48 animate-pulse rounded-[var(--ec-radius-md)] bg-subtle" />
        ) : (
          <MoodTrendChart points={points} />
        )}
      </section>

      <section className={`${CARD} flex items-center gap-4`}>
        <CatMascot size={72} expression="home" className="shrink-0" />
        <div>
          <h2 className="font-medium text-ink">Meo nhắc hôm nay</h2>
          <p className="text-body">Bạn chỉ cần chọn một việc nhỏ phù hợp với mình.</p>
        </div>
      </section>

      {pairs.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-medium text-ink">Trước và sau hoạt động</h2>
          <p className="mb-3 text-sm text-muted">
            Đây là ghi nhận cảm xúc của chính bạn ở hai thời điểm, không phải bằng chứng
            rằng hoạt động đó tạo ra thay đổi.
          </p>
          <ul className="flex flex-col gap-2">
            {pairs.map((p) => (
              <li key={p.activityRef} className={CARD}>
                {p.before}/10 → {p.after}/10
                <span className="ml-2 text-muted">
                  ({p.delta > 0 ? `+${p.delta}` : p.delta})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium text-ink">Bài tập CBT đã làm</h2>
        {cbtFailed ? (
          <KhoiLoi
            noiDung="Chưa tải được lịch sử bài tập CBT lúc này — có thể do mạng chập chờn thôi. Những gì bạn đã làm vẫn còn nguyên, không mất đâu."
            thuLai={loadCbt}
          />
        ) : cbtSessions === null ? (
          <div aria-busy="true" className="h-24 animate-pulse rounded-[var(--ec-radius-lg)] bg-subtle" />
        ) : cbtSessions.length === 0 ? (
          <p className="rounded-[var(--ec-radius-lg)] bg-subtle px-5 py-6 text-body">
            Bạn chưa làm bài tập nào.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cbtSessions.map((s) => (
              <li key={s.id} className={`${CARD} flex items-baseline justify-between`}>
                <span className="text-body">{s.summary || "Không có ghi chú"}</span>
                <span className="text-sm text-muted">
                  {s.createdAt ? dateFormatter.format(s.createdAt) : "Đang đồng bộ…"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-ink">Lịch sử làm bài kiểm tra</h2>
        {attemptsFailed ? (
          <KhoiLoi
            noiDung="Chưa tải được lịch sử làm bài lúc này — có thể do mạng chập chờn thôi. Kết quả bạn đã làm vẫn còn nguyên, không mất đâu."
            thuLai={loadAttempts}
          />
        ) : attempts === null ? (
          <div aria-busy="true" className="h-24 animate-pulse rounded-[var(--ec-radius-lg)] bg-subtle" />
        ) : attempts.length === 0 ? (
          <p className="rounded-[var(--ec-radius-lg)] bg-subtle px-5 py-6 text-body">
            Bạn chưa làm bài kiểm tra nào.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {attempts.map((a) => (
              <li key={a.id} className={`${CARD} flex items-baseline justify-between`}>
                <span className="text-body">Điểm {a.score}</span>
                <span className="text-sm text-muted">
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

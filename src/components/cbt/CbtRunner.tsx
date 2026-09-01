"use client";

import { useState } from "react";
import Link from "next/link";
import { MoodForm } from "@/components/mood/MoodForm";
import { SampleContentBanner } from "@/components/test/SampleContentBanner";
import { ReflectionCard } from "@/components/ai/ReflectionCard";
import { newSessionRef, saveCbtSession } from "@/lib/firestore/cbt-sessions";
import { saveMoodLog, type MoodInput } from "@/lib/firestore/moods";
import type { CbtModuleListItem } from "@/lib/firebase/queries-public";

type Phase = "intro" | "before" | "steps" | "summary" | "after" | "done";

type Props = {
  module: CbtModuleListItem;
  uid: string | null;
  /** đã đăng nhập và đã xác thực email */
  canSave: boolean;
};

export function CbtRunner({ module: mod, uid, canSave }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [session, setSession] = useState<{ id: string; path: string } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  // Id của mood log "sau" — dùng để ReflectionCard biết phản chiếu nào thuộc
  // về nó ở phase "done" (Task 11b). Chỉ set được khi mood "sau" lưu thành
  // công; bỏ qua bước đó hoặc lưu lỗi thì vẫn null, ReflectionCard không render.
  const [afterMoodLogId, setAfterMoodLogId] = useState<string | null>(null);

  function start() {
    setSession(newSessionRef());
    // Khách chưa đăng nhập BỎ QUA bước ghi cảm xúc trước/sau: không có uid thì
    // không lưu được gì, mà hiện một form rồi âm thầm vứt dữ liệu đi là nói dối
    // học sinh. Vào thẳng phần bài tập — đó mới là thứ các em tới để làm.
    setPhase(canSave ? "before" : "steps");
  }

  async function handleMood(input: MoodInput) {
    if (!uid) return;
    // Cảm xúc không lưu được thì vẫn cho đi tiếp — bài tập quan trọng hơn.
    try {
      const id = await saveMoodLog(uid, input);
      if (phase === "after") setAfterMoodLogId(id);
    } catch {
      // Nuốt có chủ đích: xem design spec §9.
    }
    setPhase(phase === "before" ? "steps" : "done");
  }

  async function finish() {
    // Chuyển sang bước cảm xúc "sau" ngay, không chờ ghi phiên xong — học
    // sinh không phải đứng nhìn màn hình chờ mạng.
    setPhase(canSave ? "after" : "done");
    if (!uid || !session) return;
    try {
      await saveCbtSession(uid, session.id, {
        moduleId: mod.id,
        moduleVersion: mod.version,
        answers,
        summary,
      });
    } catch {
      // Ghi phiên hỏng KHÔNG được kéo theo việc bỏ bước cảm xúc "sau": cảm
      // xúc "trước" đã ghi rồi và đã trỏ vào linkedActivityRef này, nên nếu
      // bỏ luôn cảm xúc "sau" thì cặp trước/sau (pairBeforeAfter) cũng mất
      // theo — một lỗi lưu trữ biến thành hai. Học sinh chỉ cần biết bài đang
      // chờ đồng bộ, không cần biết chi tiết kỹ thuật.
      setSaveFailed(true);
    }
  }

  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <h1 className="text-2xl font-semibold text-slate-900">{mod.title}</h1>

      {mod.isSampleContent && <SampleContentBanner />}

      <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">{mod.disclaimer}</p>

      {phase === "intro" && (
        <section className="flex flex-col gap-4">
          <p className="text-slate-700">{mod.intro}</p>
          {canSave ? (
            <button
              type="button" onClick={start}
              className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white"
            >
              Bắt đầu
            </button>
          ) : uid ? (
            <Link href="/xac-thuc-email" className="min-h-12 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 py-3 text-center font-medium text-ink-inverse">
              Xác thực email để làm bài
            </Link>
          ) : (
            <>
              {/*
                Phản hồi 2.2 và 5.5: trang chủ nói dùng được không cần tài
                khoản, nhưng mở bài tập lại bị chặn đăng ký ngay. Khách LÀM THỬ
                trọn vẹn được, chỉ không lưu lại — và chỉ được mời tạo tài khoản
                SAU KHI đã thấy bài tập có ích hay không.
              */}
              <button
                type="button" onClick={start}
                className="min-h-12 self-start rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 font-medium text-ink-inverse"
              >
                Làm thử
              </button>
              <p className="text-sm text-muted">
                Bạn làm thử được ngay mà không cần tài khoản. Chỉ có điều bài làm sẽ không
                được lưu lại.
              </p>
            </>
          )}
        </section>
      )}

      {(phase === "before" || phase === "after") && session && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-slate-900">
            {phase === "before" ? "Bạn đang thấy thế nào?" : "Sau bài tập, bạn thấy thế nào?"}
          </h2>
          <MoodForm
            onSubmit={handleMood}
            context={phase}
            linkedActivityRef={session.path}
            submitLabel={phase === "before" ? "Lưu và bắt đầu" : "Lưu và xem lời kết"}
          />
          <button
            type="button"
            onClick={() => setPhase(phase === "before" ? "steps" : "done")}
            className="self-start text-sm text-slate-500 underline"
          >
            Bỏ qua bước này
          </button>
        </section>
      )}

      {phase === "steps" && (
        <section className="flex flex-col gap-5">
          {mod.steps.map((step) => (
            <label key={step.id} className="flex flex-col gap-1">
              <span className="font-medium text-slate-900">{step.prompt}</span>
              {step.hint && <span className="text-sm text-slate-500">{step.hint}</span>}
              <textarea
                rows={3} maxLength={2000}
                value={answers[step.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [step.id]: e.target.value }))}
                className="rounded-lg border border-slate-300 p-2"
              />
            </label>
          ))}
          <button
            type="button" onClick={() => setPhase("summary")}
            className="self-start rounded-lg bg-teal-600 px-4 py-2 font-medium text-white"
          >
            Tiếp tục
          </button>
        </section>
      )}

      {phase === "summary" && (
        <section className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-900">
              Nếu tóm lại trong một câu, bạn muốn nói gì với chính mình?
            </span>
            <span className="text-sm text-slate-500">Không bắt buộc.</span>
            <textarea
              rows={2} maxLength={2000} value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="rounded-lg border border-slate-300 p-2"
            />
          </label>
          <button
            type="button" onClick={finish}
            className="self-start rounded-lg bg-teal-600 px-4 py-2 font-medium text-white"
          >
            Hoàn thành
          </button>
        </section>
      )}

      {phase === "done" && (
        <section className="flex flex-col gap-4">
          <p className="text-slate-700">{mod.closingText}</p>
          {saveFailed && (
            <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
              Bài của bạn đang chờ đồng bộ. Khi có mạng lại, nó sẽ tự lưu.
            </p>
          )}
          {uid && afterMoodLogId && <ReflectionCard moodLogId={afterMoodLogId} uid={uid} />}

          {/*
            Lời mời tạo tài khoản đặt Ở ĐÂY, sau khi khách đã làm xong — đúng
            thứ tự phản hồi 2.2 đề nghị: "Sau khi hoàn thành mới hỏi". Mời
            trước khi các em kịp thấy bài tập có ích hay không thì chỉ là một
            cái cổng chắn đường.
          */}
          {!uid && (
            <section className="rounded-[var(--ec-radius-lg)] bg-brand-soft px-5 py-4">
              <h2 className="font-medium text-ink">Bạn có muốn tạo tài khoản để lưu lại không?</h2>
              <p className="mt-1 text-body">
                Có tài khoản thì bài này được lưu, và bạn xem lại được thay đổi của mình theo
                thời gian. Không tạo cũng không sao — bạn vẫn làm thử tiếp được bất cứ lúc nào.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href="/dang-ky"
                  className="min-h-11 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 py-2.5 font-medium text-ink-inverse"
                >
                  Tạo tài khoản
                </Link>
                <Link
                  href="/cbt"
                  className="min-h-11 rounded-[var(--ec-radius-md)] border border-line px-5 py-2.5 text-body"
                >
                  Để sau
                </Link>
              </div>
            </section>
          )}
          {mod.suggestedResourceSlugs.length > 0 && (
            <nav className="flex flex-col gap-2">
              <h2 className="font-medium text-slate-900">Có thể bạn muốn đọc thêm</h2>
              {mod.suggestedResourceSlugs.map((slug) => (
                <Link key={slug} href={`/thu-vien/${slug}`} className="text-teal-700 underline">
                  {slug}
                </Link>
              ))}
            </nav>
          )}
          <Link href="/tien-trinh" className="text-teal-700 underline">Xem tiến trình của bạn</Link>
        </section>
      )}
    </article>
  );
}

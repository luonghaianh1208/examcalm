"use client";

import { useState } from "react";
import { calculateScore, resolveLevel, isComplete } from "@/lib/scoring";
import { estimateMinutes } from "@/lib/test-meta";
import { SampleContentBanner } from "./SampleContentBanner";
import type { TestDefinition } from "@/lib/types/test";

export type CompletedTest = {
  testId: string;
  testVersion: number;
  answers: Record<string, number>;
  score: number;
  level: string;
  interpretation: string;
};

type Props = {
  test: TestDefinition & { id: string };
  onComplete: (result: CompletedTest) => void;
};

/**
 * Làm bài theo TỪNG CÂU, không đổ cả bảng ra một lượt.
 *
 * Phản hồi 1.5 của học sinh: mở GAD-7 thấy cả 7 câu cùng lúc nên "cảm thấy
 * giống đang điền phiếu khảo sát". Một câu mỗi màn hình cộng thanh tiến độ đổi
 * hẳn cảm giác đó, và cũng là thứ Brand Guideline mục 8 dự liệu sẵn ("Test
 * progress: width transition 180 ms").
 *
 * Có nút Quay lại ở mọi bước: thang tự đánh giá thường khiến người ta đổi ý
 * sau khi đọc câu tiếp theo, khoá lại là ép trả lời sai.
 */
export function TestRunner({ test, onComplete }: Props) {
  // "intro" tách riêng để học sinh đọc metadata và cảnh báo TRƯỚC khi bắt đầu,
  // thay vì phải cuộn qua một bức tường chữ mới tới câu hỏi đầu tiên.
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const total = test.questions.length;
  const minutes = estimateMinutes(total);
  const complete = isComplete(test.questions, answers);

  function handleSubmit() {
    const score = calculateScore(test.questions, answers);
    const threshold = resolveLevel(score, test.scoring.thresholds);
    onComplete({
      testId: test.id,
      testVersion: test.version,
      answers,
      score,
      level: threshold?.level ?? "khong-xac-dinh",
      interpretation: threshold?.interpretation ?? "Chưa có diễn giải cho mức điểm này.",
    });
  }

  if (!started) {
    return (
      <div className="flex flex-col gap-5">
        {test.isSampleContent && <SampleContentBanner />}

        {/* Metadata đứng TRƯỚC cảnh báo: học sinh cần biết mình sắp bỏ ra bao
            lâu và để làm gì, rồi mới tới phần ranh giới an toàn. */}
        <dl className="grid gap-3 rounded-[var(--ec-radius-lg)] bg-feature-test/10 px-5 py-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">Thời gian</dt>
            <dd className="font-medium text-ink">
              {minutes > 0 ? `khoảng ${minutes} phút` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Số câu</dt>
            <dd className="font-medium text-ink">{total} câu</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Thẩm định</dt>
            <dd className="font-medium text-ink">
              {/* Chuỗi rỗng nghĩa là CHƯA thẩm định, và phải nói thẳng. Im lặng
                  ở đây để người đọc tự suy ra là đã có chuyên gia duyệt thì tệ
                  hơn hẳn việc nói chưa có. */}
              {test.expertReviewedBy || "Chưa có chuyên gia thẩm định"}
            </dd>
          </div>
        </dl>

        {test.purpose && (
          <div>
            <h2 className="mb-1 font-medium text-ink">Bài này giúp bạn hiểu điều gì</h2>
            <p className="text-body">{test.purpose}</p>
          </div>
        )}

        <p className="rounded-[var(--ec-radius-lg)] bg-warning-soft px-5 py-4 text-sm text-warning">
          {test.disclaimer}
        </p>

        <button
          type="button"
          onClick={() => setStarted(true)}
          className="min-h-12 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-6 font-medium text-ink-inverse"
        >
          Bắt đầu
        </button>
      </div>
    );
  }

  // index luôn nằm trong [0, total) — chỉ đổi qua hai nút Quay lại/Tiếp theo,
  // cả hai đều chặn ở biên.
  const question = test.questions[index]!;
  const answered = answers[question.id] !== undefined;
  const last = index === total - 1;

  return (
    <div className="flex flex-col gap-6">
      {/* Banner theo suốt cả bài, không chỉ ở màn giới thiệu. Cờ isSampleContent
          nghĩa là bộ câu hỏi CHƯA được thẩm định chuyên môn — học sinh đang
          ngồi trả lời chính những câu đó cần thấy cảnh báo, chứ không phải chỉ
          thấy một lần rồi nó biến mất. */}
      {test.isSampleContent && <SampleContentBanner />}

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="font-medium text-ink">
            Câu {index + 1}/{total}
          </p>
          {/* Nút bỏ qua phần còn lại KHÔNG tồn tại: điểm chỉ có nghĩa khi trả
              lời hết. Thay vào đó cho phép quay lại tự do. */}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-subtle" role="presentation">
          <div
            className="h-full rounded-full bg-feature-test transition-[width] duration-[var(--ec-duration-base)]"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-3 text-lg font-medium text-ink">{question.text}</legend>
        {question.options.map((option, optionIndex) => {
          const chosen = answers[question.id] === optionIndex;
          return (
            <label
              key={optionIndex}
              className={`flex min-h-12 items-center gap-3 rounded-[var(--ec-radius-md)] border px-4 py-2 transition-colors ${
                chosen ? "border-transparent bg-brand-soft font-medium text-ink" : "border-line text-body"
              }`}
            >
              <input
                type="radio"
                name={question.id}
                value={optionIndex}
                checked={chosen}
                onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: optionIndex }))}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </fieldset>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="min-h-12 rounded-[var(--ec-radius-md)] border border-line px-5 text-body disabled:opacity-50"
        >
          Quay lại
        </button>

        {last ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!complete}
            className="min-h-12 flex-1 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 font-medium text-ink-inverse disabled:opacity-50"
          >
            Xem kết quả
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
            disabled={!answered}
            className="min-h-12 flex-1 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 font-medium text-ink-inverse disabled:opacity-50"
          >
            Tiếp theo
          </button>
        )}
      </div>

      {last && !complete && (
        <p className="text-sm text-muted">
          Còn câu chưa trả lời. Bấm Quay lại để xem lại những câu đã bỏ qua nhé.
        </p>
      )}
    </div>
  );
}

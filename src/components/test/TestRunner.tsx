"use client";

import { useState } from "react";
import { calculateScore, resolveLevel, isComplete } from "@/lib/scoring";
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

export function TestRunner({ test, onComplete }: Props) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
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

  return (
    <div className="flex flex-col gap-6">
      {test.isSampleContent && <SampleContentBanner />}

      <p className="rounded-xl bg-slate-100 px-4 py-3 text-slate-700">{test.disclaimer}</p>

      {test.questions.map((question, index) => (
        <fieldset key={question.id} className="flex flex-col gap-2">
          <legend className="mb-1 font-medium">
            {index + 1}. {question.text}
          </legend>
          {question.options.map((option, optionIndex) => (
            <label key={optionIndex} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <input
                type="radio"
                name={question.id}
                value={optionIndex}
                checked={answers[question.id] === optionIndex}
                onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: optionIndex }))}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      ))}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!complete}
        className="rounded-lg bg-teal-600 px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        Xem kết quả
      </button>
      {!complete && (
        <p className="text-sm text-slate-500">Bạn trả lời hết các câu để xem kết quả nhé.</p>
      )}
    </div>
  );
}

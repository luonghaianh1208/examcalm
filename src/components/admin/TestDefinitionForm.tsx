"use client";

import type { TestDefinitionDraft } from "@/lib/firestore/admin-tests";
import { nextItemId } from "@/lib/next-item-id";

/**
 * Cùng nguyên tắc với CbtModuleForm: giữ đúng dạng NGƯỜI DÙNG GÕ (điểm và
 * ngưỡng là chuỗi), chuẩn hoá một lần ở testFormToDraft(), còn phán xét hợp
 * lệ để validateTestDraft() lo — một nguồn luật duy nhất cho cả form và ô JSON.
 */
export type OptionForm = { label: string; score: string };
export type QuestionForm = { id: string; text: string; options: OptionForm[] };
export type ThresholdForm = { min: string; max: string; level: string; interpretation: string };

export type TestFormValue = {
  title: string;
  version: string;
  isSampleContent: boolean;
  disclaimer: string;
  questions: QuestionForm[];
  thresholds: ThresholdForm[];
};

/** Khớp questionSchema.options.min(2) trong types/test.ts. */
export const MIN_OPTIONS = 2;

export const EMPTY_TEST_FORM: TestFormValue = {
  title: "",
  version: "1",
  isSampleContent: false,
  disclaimer: "Không thay thế chuyên gia. Kết quả chỉ mang tính tham khảo.",
  questions: [
    { id: "q1", text: "", options: [{ label: "", score: "0" }, { label: "", score: "1" }] },
  ],
  thresholds: [{ min: "0", max: "0", level: "", interpretation: "" }],
};

export function testFormToDraft(v: TestFormValue): unknown {
  return {
    title: v.title.trim(),
    version: Number(v.version),
    isSampleContent: v.isSampleContent,
    disclaimer: v.disclaimer.trim(),
    questions: v.questions.map((q) => ({
      id: q.id,
      text: q.text.trim(),
      options: q.options.map((o) => ({ label: o.label.trim(), score: Number(o.score) })),
    })),
    scoring: {
      thresholds: v.thresholds.map((t) => ({
        min: Number(t.min),
        max: Number(t.max),
        level: t.level.trim(),
        interpretation: t.interpretation.trim(),
      })),
    },
  };
}

export function draftToTestForm(d: TestDefinitionDraft): TestFormValue {
  return {
    title: d.title,
    version: String(d.version),
    isSampleContent: d.isSampleContent,
    disclaimer: d.disclaimer,
    questions: d.questions.map((q) => ({
      id: q.id,
      text: q.text,
      options: q.options.map((o) => ({ label: o.label, score: String(o.score) })),
    })),
    thresholds: d.scoring.thresholds.map((t) => ({
      min: String(t.min),
      max: String(t.max),
      level: t.level,
      interpretation: t.interpretation,
    })),
  };
}

type Props = { value: TestFormValue; onChange: (v: TestFormValue) => void };

export function TestDefinitionForm({ value, onChange }: Props) {
  const dat = <K extends keyof TestFormValue>(key: K, v: TestFormValue[K]) =>
    onChange({ ...value, [key]: v });

  const datCau = (i: number, phan: Partial<QuestionForm>) =>
    dat("questions", value.questions.map((q, j) => (j === i ? { ...q, ...phan } : q)));

  const datMuc = (i: number, phan: Partial<ThresholdForm>) =>
    dat("thresholds", value.thresholds.map((t, j) => (j === i ? { ...t, ...phan } : t)));

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span>Tiêu đề</span>
        <input
          value={value.title}
          onChange={(e) => dat("title", e.target.value)}
          className="rounded-lg border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span>Phiên bản</span>
        <input
          type="number"
          min={1}
          value={value.version}
          onChange={(e) => dat("version", e.target.value)}
          className="w-32 rounded-lg border px-3 py-2"
        />
        <span className="text-sm text-slate-500">
          Tăng số này khi sửa nội dung — bài làm cũ vẫn ghi phiên bản lúc học sinh làm.
        </span>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.isSampleContent}
          onChange={(e) => dat("isSampleContent", e.target.checked)}
        />
        <span>Nội dung mẫu (chưa được thẩm định chuyên môn)</span>
      </label>

      <label className="flex flex-col gap-1">
        <span>Lời miễn trừ</span>
        <textarea
          value={value.disclaimer}
          onChange={(e) => dat("disclaimer", e.target.value)}
          rows={2}
          className="rounded-lg border px-3 py-2"
        />
      </label>

      <div className="flex flex-col gap-3">
        <h3 className="font-medium">Câu hỏi ({value.questions.length})</h3>

        {value.questions.map((q, i) => (
          <fieldset key={q.id} className="flex flex-col gap-2 rounded-xl border p-3">
            <legend className="px-1 text-sm font-medium">Câu {i + 1}</legend>

            <label className="flex flex-col gap-1">
              <span>Nội dung câu hỏi</span>
              <input
                value={q.text}
                onChange={(e) => datCau(i, { text: e.target.value })}
                className="rounded-lg border px-3 py-2"
              />
            </label>

            <span className="text-sm text-slate-600">Các phương án trả lời</span>
            {q.options.map((o, k) => (
              <div key={k} className="flex flex-wrap items-end gap-2">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-sm">Nhãn phương án</span>
                  <input
                    value={o.label}
                    onChange={(e) =>
                      datCau(i, {
                        options: q.options.map((x, m) => (m === k ? { ...x, label: e.target.value } : x)),
                      })
                    }
                    className="rounded-lg border px-3 py-2"
                  />
                </label>
                <label className="flex w-24 flex-col gap-1">
                  <span className="text-sm">Điểm</span>
                  <input
                    type="number"
                    value={o.score}
                    onChange={(e) =>
                      datCau(i, {
                        options: q.options.map((x, m) => (m === k ? { ...x, score: e.target.value } : x)),
                      })
                    }
                    className="rounded-lg border px-3 py-2"
                  />
                </label>
                <button
                  type="button"
                  disabled={q.options.length <= MIN_OPTIONS}
                  onClick={() => datCau(i, { options: q.options.filter((_, m) => m !== k) })}
                  className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                >
                  Xóa phương án
                </button>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => datCau(i, { options: [...q.options, { label: "", score: "0" }] })}
                className="rounded-lg border px-3 py-1.5 text-sm"
              >
                Thêm phương án
              </button>
              <button
                type="button"
                onClick={() => dat("questions", value.questions.filter((_, j) => j !== i))}
                className="rounded-lg border px-3 py-1.5 text-sm"
              >
                Xóa câu hỏi
              </button>
              <span className="text-sm text-slate-400">mã câu: {q.id}</span>
            </div>
          </fieldset>
        ))}

        <button
          type="button"
          onClick={() =>
            dat("questions", [
              ...value.questions,
              {
                id: nextItemId("q", value.questions.map((q) => q.id)),
                text: "",
                options: [{ label: "", score: "0" }, { label: "", score: "1" }],
              },
            ])
          }
          className="self-start rounded-lg border px-4 py-2"
        >
          Thêm câu hỏi
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-medium">Thang điểm ({value.thresholds.length} mức)</h3>

        {value.thresholds.map((t, i) => (
          <fieldset key={i} className="flex flex-col gap-2 rounded-xl border p-3">
            <legend className="px-1 text-sm font-medium">Mức {i + 1}</legend>

            <div className="flex flex-wrap gap-2">
              <label className="flex w-28 flex-col gap-1">
                <span className="text-sm">Từ</span>
                <input
                  type="number"
                  value={t.min}
                  onChange={(e) => datMuc(i, { min: e.target.value })}
                  className="rounded-lg border px-3 py-2"
                />
              </label>
              <label className="flex w-28 flex-col gap-1">
                <span className="text-sm">Đến</span>
                <input
                  type="number"
                  value={t.max}
                  onChange={(e) => datMuc(i, { max: e.target.value })}
                  className="rounded-lg border px-3 py-2"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-sm">Tên mức</span>
                <input
                  value={t.level}
                  onChange={(e) => datMuc(i, { level: e.target.value })}
                  className="rounded-lg border px-3 py-2"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-sm">Diễn giải</span>
              <textarea
                value={t.interpretation}
                onChange={(e) => datMuc(i, { interpretation: e.target.value })}
                rows={2}
                className="rounded-lg border px-3 py-2"
              />
            </label>

            <button
              type="button"
              onClick={() => dat("thresholds", value.thresholds.filter((_, j) => j !== i))}
              className="self-start rounded-lg border px-3 py-1.5 text-sm"
            >
              Xóa mức
            </button>
          </fieldset>
        ))}

        <button
          type="button"
          onClick={() =>
            dat("thresholds", [...value.thresholds, { min: "0", max: "0", level: "", interpretation: "" }])
          }
          className="self-start rounded-lg border px-4 py-2"
        >
          Thêm mức
        </button>
      </div>
    </div>
  );
}

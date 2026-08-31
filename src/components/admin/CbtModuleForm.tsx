"use client";

import type { CbtStep } from "@/lib/types/cbt";
import type { CbtModuleDraft } from "@/lib/firestore/admin-cbt";
import { nextItemId } from "@/lib/next-item-id";

/**
 * Giá trị form giữ đúng dạng NGƯỜI DÙNG GÕ, không phải dạng đã chuẩn hoá:
 * `version` là chuỗi, `suggestedResourceSlugs` là chuỗi ngăn bởi dấu phẩy.
 * Ép kiểu ngay từng phím sẽ làm ô nhập giật (xoá "1" để gõ "2" ra "12") và
 * nuốt mất dấu phẩy đang gõ dở. Chuẩn hoá làm một lần ở cbtFormToDraft(),
 * còn phán xét hợp lệ là việc của validateCbtDraft() — một nguồn luật duy nhất.
 */
export type CbtFormValue = {
  title: string;
  version: string;
  isSampleContent: boolean;
  disclaimer: string;
  intro: string;
  steps: CbtStep[];
  closingText: string;
  suggestedResourceSlugs: string;
};

/** Khớp cbtModuleSchema.steps.max(12) trong types/cbt.ts — đổi một bên phải đổi bên kia. */
export const MAX_STEPS = 12;

export const EMPTY_CBT_FORM: CbtFormValue = {
  title: "",
  version: "1",
  isSampleContent: false,
  disclaimer: "Không thay thế chuyên gia. Kết quả chỉ mang tính tham khảo.",
  intro: "",
  steps: [{ id: "s1", prompt: "", hint: "" }],
  closingText: "",
  suggestedResourceSlugs: "",
};

const tachSlug = (s: string): string[] =>
  s.split(",").map((x) => x.trim()).filter((x) => x.length > 0);

/** Dạng form -> dạng draft. Không phán xét hợp lệ, để validateCbtDraft() làm. */
export function cbtFormToDraft(v: CbtFormValue): unknown {
  return {
    title: v.title.trim(),
    version: Number(v.version),
    isSampleContent: v.isSampleContent,
    disclaimer: v.disclaimer.trim(),
    intro: v.intro,
    steps: v.steps.map((s) => ({ id: s.id, prompt: s.prompt.trim(), hint: s.hint })),
    closingText: v.closingText,
    suggestedResourceSlugs: tachSlug(v.suggestedResourceSlugs),
  };
}

export function draftToCbtForm(d: CbtModuleDraft): CbtFormValue {
  return {
    title: d.title,
    version: String(d.version),
    isSampleContent: d.isSampleContent,
    disclaimer: d.disclaimer,
    intro: d.intro,
    steps: d.steps,
    closingText: d.closingText,
    suggestedResourceSlugs: d.suggestedResourceSlugs.join(", "),
  };
}

type Props = { value: CbtFormValue; onChange: (v: CbtFormValue) => void };

export function CbtModuleForm({ value, onChange }: Props) {
  const dat = <K extends keyof CbtFormValue>(key: K, v: CbtFormValue[K]) =>
    onChange({ ...value, [key]: v });

  const datBuoc = (i: number, phan: Partial<CbtStep>) =>
    dat("steps", value.steps.map((s, j) => (j === i ? { ...s, ...phan } : s)));

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span>Tiêu đề</span>
        <input value={value.title} onChange={(e) => dat("title", e.target.value)} className="rounded-lg border px-3 py-2" />
      </label>

      <label className="flex flex-col gap-1">
        <span>Phiên bản</span>
        <input
          type="number" min={1} value={value.version}
          onChange={(e) => dat("version", e.target.value)}
          className="w-32 rounded-lg border px-3 py-2"
        />
        <span className="text-sm text-slate-500">
          Tăng số này khi sửa nội dung chuyên môn — bài làm cũ của học sinh vẫn ghi phiên bản lúc họ làm.
        </span>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox" checked={value.isSampleContent}
          onChange={(e) => dat("isSampleContent", e.target.checked)}
        />
        <span>Nội dung mẫu (chưa được thẩm định chuyên môn)</span>
      </label>

      <label className="flex flex-col gap-1">
        <span>Lời miễn trừ</span>
        <textarea value={value.disclaimer} onChange={(e) => dat("disclaimer", e.target.value)} rows={2} className="rounded-lg border px-3 py-2" />
      </label>

      <label className="flex flex-col gap-1">
        <span>Giới thiệu</span>
        <textarea value={value.intro} onChange={(e) => dat("intro", e.target.value)} rows={3} className="rounded-lg border px-3 py-2" />
      </label>

      <div className="flex flex-col gap-3">
        <h3 className="font-medium">Các bước ({value.steps.length}/{MAX_STEPS})</h3>

        {value.steps.map((step, i) => (
          <fieldset key={step.id} className="flex flex-col gap-2 rounded-xl border p-3">
            <legend className="px-1 text-sm font-medium">Bước {i + 1}</legend>

            <label className="flex flex-col gap-1">
              <span>Câu hỏi</span>
              <input value={step.prompt} onChange={(e) => datBuoc(i, { prompt: e.target.value })} className="rounded-lg border px-3 py-2" />
            </label>

            <label className="flex flex-col gap-1">
              <span>Gợi ý (không bắt buộc)</span>
              <input value={step.hint} onChange={(e) => datBuoc(i, { hint: e.target.value })} className="rounded-lg border px-3 py-2" />
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={value.steps.length <= 1}
                onClick={() => dat("steps", value.steps.filter((_, j) => j !== i))}
                className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Xóa bước
              </button>
              <span className="text-sm text-slate-400">mã bước: {step.id}</span>
            </div>
          </fieldset>
        ))}

        <button
          type="button"
          disabled={value.steps.length >= MAX_STEPS}
          onClick={() =>
            dat("steps", [
              ...value.steps,
              { id: nextItemId("s", value.steps.map((s) => s.id)), prompt: "", hint: "" },
            ])
          }
          className="self-start rounded-lg border px-4 py-2 disabled:opacity-50"
        >
          Thêm bước
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span>Lời kết</span>
        <textarea value={value.closingText} onChange={(e) => dat("closingText", e.target.value)} rows={2} className="rounded-lg border px-3 py-2" />
      </label>

      <label className="flex flex-col gap-1">
        <span>Gợi ý tài nguyên (slug, cách nhau bằng dấu phẩy, tối đa 5)</span>
        <input
          value={value.suggestedResourceSlugs}
          onChange={(e) => dat("suggestedResourceSlugs", e.target.value)}
          className="rounded-lg border px-3 py-2 font-mono text-sm"
        />
      </label>
    </div>
  );
}
